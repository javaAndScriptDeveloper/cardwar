#!/usr/bin/env bash
# End-to-end smoke test against a RUNNING Cardwar stack: two players register, one opens the event stream, they
# play a duel to completion using only the public API, and the script checks the negative paths on the way.
#
#   BASE_URL=https://localhost scripts/smoke.sh          # default; self-signed cert accepted with -k
#   BASE_URL=https://cardwar.example.com scripts/smoke.sh
#
# Needs: bash, curl, jq. With docker available and run from the repository root, it also inspects the Redis key's
# TTL while the duel is in progress and the result row in Postgres afterwards.
set -euo pipefail

BASE_URL="${BASE_URL:-https://localhost}"
API="$BASE_URL/api/v1"
CURL=(curl -sS -k --max-time 20)
PASSWORD="${SMOKE_PASSWORD:-smoke-test-password-$RANDOM}"
SUFFIX="$(date +%s)-$RANDOM"
ALICE_NAME="smoke-alice-$SUFFIX"
BOB_NAME="smoke-bob-$SUFFIX"
CAROL_NAME="smoke-carol-$SUFFIX"
MOVE_LIMIT=1000
COMPOSE_ENV_FILE="${ENV_FILE:-$([ -f .env ] && echo .env || echo .env.example)}"

pass() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✘\033[0m %s\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

for tool in curl jq; do
  command -v "$tool" >/dev/null || fail "$tool is required"
done

# request METHOD PATH [TOKEN] [JSON]  -> sets RESP_STATUS and RESP_BODY
request() {
  local method="$1" path="$2" token="${3:-}" body="${4:-}"
  local -a args=(-X "$method" -H 'Accept: application/json' -o /tmp/smoke.body -w '%{http_code}' "$API$path")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' --data "$body")
  RESP_STATUS="$("${CURL[@]}" "${args[@]}")"
  RESP_BODY="$(cat /tmp/smoke.body)"
}

expect_status() {
  local want="$1" what="$2"
  [ "$RESP_STATUS" = "$want" ] && pass "$what → $want" || fail "$what: expected $want, got $RESP_STATUS: $RESP_BODY"
}

step "1. Stack is up behind nginx"
request GET "/../../actuator/health" && expect_status 200 "GET /actuator/health"
[ "$(jq -r .status <<<"$RESP_BODY")" = "UP" ] && pass "health is UP" || fail "health: $RESP_BODY"

step "2. Unauthenticated access is refused"
request GET "/me" && expect_status 401 "GET /me without a token"

step "3. Two players register, a third for the authorization checks"
request POST "/auth/register" "" "$(jq -nc --arg u "$ALICE_NAME" --arg p "$PASSWORD" '{username:$u,password:$p}')"
expect_status 201 "register $ALICE_NAME"
ALICE_ID="$(jq -r .playerId <<<"$RESP_BODY")"
request POST "/auth/login" "" "$(jq -nc --arg u "$ALICE_NAME" --arg p "$PASSWORD" '{username:$u,password:$p}')"
expect_status 200 "login $ALICE_NAME"
ALICE="$(jq -r .token <<<"$RESP_BODY")"
grep -q "$PASSWORD" <<<"$RESP_BODY" && fail "login response echoes the password" || pass "password never echoed"

request POST "/auth/register" "" "$(jq -nc --arg u "$BOB_NAME" --arg p "$PASSWORD" '{username:$u,password:$p}')"
expect_status 201 "register $BOB_NAME"
BOB_ID="$(jq -r .playerId <<<"$RESP_BODY")"; BOB="$(jq -r .token <<<"$RESP_BODY")"
request POST "/auth/register" "" "$(jq -nc --arg u "$CAROL_NAME" --arg p "$PASSWORD" '{username:$u,password:$p}')"
expect_status 201 "register $CAROL_NAME"
CAROL="$(jq -r .token <<<"$RESP_BODY")"

request POST "/auth/login" "" "$(jq -nc --arg u "$ALICE_NAME" '{username:$u,password:"wrong-password"}')"
expect_status 401 "login with the wrong password"

step "4. Alice challenges Bob"
request POST "/duels" "$ALICE" "$(jq -nc --arg o "$BOB_NAME" '{opponentUsername:$o}')"
expect_status 201 "POST /duels"
DUEL_ID="$(jq -r .duelId <<<"$RESP_BODY")"
[ "$(jq -r '.hand | length' <<<"$RESP_BODY")" = 6 ] && pass "six cards dealt" || fail "hand: $RESP_BODY"
[ "$(jq -r '.opponentHandCount' <<<"$RESP_BODY")" = 6 ] && pass "opponent hand is a count only" || fail "$RESP_BODY"
jq -e '.handA or .handB or .talon' <<<"$RESP_BODY" >/dev/null && fail "raw state leaked" || pass "no raw state in the view"

step "5. Bob opens the event stream through nginx"
SSE_LOG="$(mktemp)"
"${CURL[@]}" -N --max-time 600 -H "Authorization: Bearer $BOB" -H 'Accept: text/event-stream' \
  "$API/duels/$DUEL_ID/events" >"$SSE_LOG" 2>/dev/null &
SSE_PID=$!
trap 'kill $SSE_PID 2>/dev/null || true; rm -f "$SSE_LOG" /tmp/smoke.body' EXIT
sleep 1
pass "stream open (pid $SSE_PID)"

step "6. Negative paths"
request GET "/duels/$DUEL_ID" "$CAROL" && expect_status 403 "third player reads the duel"
request POST "/duels/$DUEL_ID/moves" "$CAROL" '{"type":"END_ATTACK"}' && expect_status 403 "third player moves"
request POST "/duels/$DUEL_ID/moves" "$ALICE" '{"type":"TELEPORT"}' && expect_status 400 "unknown move type"

if command -v docker >/dev/null && [ -f docker-compose.yml ]; then
  TTL="$(docker compose -f docker-compose.yml --env-file "$COMPOSE_ENV_FILE" exec -T redis \
    sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning TTL cardwar:duel:'"$DUEL_ID" 2>/dev/null || echo "?")"
  [[ "$TTL" =~ ^[0-9]+$ ]] && [ "$TTL" -gt 0 ] && pass "Redis key TTL is $TTL s" || echo "  (skipped) Redis TTL check: $TTL"
fi

step "7. Play to completion"
# Rank order for the beats() rule, mirrored from the engine.
RANKS='["SIX","SEVEN","EIGHT","NINE","TEN","JACK","QUEEN","KING","ACE"]'
view() { request GET "/duels/$DUEL_ID" "$1"; expect_status 200 "view" >/dev/null; }
# next_move VIEW -> JSON payload, using only that player's own view.
next_move() {
  jq -c --argjson ranks "$RANKS" '
    def ri(r): r as $r | $ranks | index($r);
    def beats(a; d; t):
      if a.suit == t then (d.suit == t and ri(d.rank) > ri(a.rank))
      elif d.suit == t then true
      else (d.suit == a.suit and ri(d.rank) > ri(a.rank)) end;
    if .phase == "DEFEND" then
      (.table | map(select(.defence == null)) | first | .attack) as $target
      | (.hand | map(select(beats($target; .; $trump))) | sort_by(ri(.rank)) | first) as $card
      | if $card then {type:"DEFEND", attackCard:$target, card:$card} else {type:"TAKE"} end
    elif (.table | length) == 0 then
      {type:"ATTACK", card: (.hand | sort_by(ri(.rank)) | first)}
    else
      ([.table[] | .attack.rank, (.defence // empty | .rank)] | unique) as $ranksOnTable
      | ((.table | map(select(.defence == null)) | length) < .opponentHandCount and (.table | length) < 6) as $room
      | (.hand | map(select(.rank as $r | $ranksOnTable | index($r))) | first) as $throwIn
      | if $room and $throwIn then {type:"ATTACK", card:$throwIn} else {type:"END_ATTACK"} end
    end' --arg trump "$(jq -r .trumpSuit <<<"$1")" <<<"$1"
}
view "$ALICE"; STATE="$RESP_BODY"
moves=0
while [ "$(jq -r .phase <<<"$STATE")" != "FINISHED" ]; do
  [ "$moves" -lt "$MOVE_LIMIT" ] || fail "duel did not terminate within $MOVE_LIMIT moves"
  attacker="$(jq -r .attacker <<<"$STATE")"
  phase="$(jq -r .phase <<<"$STATE")"
  if [ "$phase" = "DEFEND" ]; then
    [ "$attacker" = "$ALICE_ID" ] && actor="$BOB" || actor="$ALICE"
  else
    [ "$attacker" = "$ALICE_ID" ] && actor="$ALICE" || actor="$BOB"
  fi
  view "$actor"; own="$RESP_BODY"
  request POST "/duels/$DUEL_ID/moves" "$actor" "$(next_move "$own")"
  [ "$RESP_STATUS" = 200 ] || fail "move $moves rejected ($RESP_STATUS): $RESP_BODY"
  STATE="$RESP_BODY"; moves=$((moves + 1))
done
pass "duel finished after $moves moves"
OUTCOME="$(jq -c .outcome <<<"$STATE")"
pass "outcome: $OUTCOME"

step "8. Bob's stream saw the game"
sleep 1
grep -q 'CARD_PLAYED' "$SSE_LOG" && pass "CARD_PLAYED events delivered live" || fail "no CARD_PLAYED on the stream"
grep -q 'DUEL_FINISHED' "$SSE_LOG" && pass "DUEL_FINISHED delivered" || fail "no DUEL_FINISHED on the stream"
grep -q '"hand"' "$SSE_LOG" && fail "a pushed event carried a hand" || pass "no hand detail on the stream"

step "9. Only the result survives"
request GET "/duels/$DUEL_ID" "$ALICE" && expect_status 404 "duel is gone from the state store"
request GET "/me" "$ALICE" && expect_status 200 "GET /me"
[ "$(jq -r .progress.duelsPlayed <<<"$RESP_BODY")" -ge 1 ] && pass "duelsPlayed recorded" || fail "$RESP_BODY"
if command -v docker >/dev/null && [ -f docker-compose.yml ]; then
  ROWS="$(docker compose -f docker-compose.yml --env-file "$COMPOSE_ENV_FILE" exec -T db \
    sh -c 'psql -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select count(*) from duel_result where duel_id = '"'"'"'"$DUEL_ID"'"'"'"'"' 2>/dev/null || echo "?")"
  [ "$ROWS" = 1 ] && pass "duel_result row present" || echo "  (skipped) Postgres check: $ROWS"
  KEY="$(docker compose -f docker-compose.yml --env-file "$COMPOSE_ENV_FILE" exec -T redis \
    sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning EXISTS cardwar:duel:'"$DUEL_ID" 2>/dev/null || echo "?")"
  [ "$KEY" = 0 ] && pass "Redis key deleted" || echo "  (skipped) Redis key check: $KEY"
fi

step "10. Login flood is throttled"
got429=no
for i in $(seq 1 15); do
  request POST "/auth/login" "" "$(jq -nc --arg u "$ALICE_NAME" '{username:$u,password:"flood"}')"
  [ "$RESP_STATUS" = 429 ] && { got429=yes; break; }
done
[ "$got429" = yes ] && pass "429 after $i attempts" || fail "no 429 after 15 login attempts"

printf '\n\033[1;32mSmoke test passed.\033[0m\n'
