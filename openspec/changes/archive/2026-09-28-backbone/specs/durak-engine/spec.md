## ADDED Requirements

### Requirement: Transport-agnostic engine API
The engine SHALL expose a pure Java API that accepts a current duel state, an acting player identifier and a command, and returns a new duel state together with the list of domain events produced. The engine MUST NOT depend on Spring, Jakarta, HTTP, Redis, Postgres, or any other Cardwar module, so that any adapter (REST now, Telegram later) can drive it unchanged.

#### Scenario: Engine has no framework dependencies
- **WHEN** the architecture test suite analyses classes in the `cardwar.engine` package
- **THEN** no class in that package references `org.springframework..`, `jakarta..`, or any other `cardwar.*` module package

#### Scenario: Applying a command returns state and events
- **WHEN** a caller invokes the engine with a valid duel state, the acting player and a legal command
- **THEN** the engine returns a new immutable duel state and an ordered list of events describing what changed
- **AND** the duel state passed in is not mutated

### Requirement: Thirty-six card deck
The engine SHALL construct a 36-card deck consisting of ranks six through ace across four suits. Ranks below six MUST NOT exist in the deck.

#### Scenario: Deck composition
- **WHEN** a new deck is constructed
- **THEN** it contains exactly 36 distinct cards
- **AND** every combination of the nine ranks (6, 7, 8, 9, 10, jack, queen, king, ace) and four suits appears exactly once

### Requirement: Cryptographically secure shuffling
The engine SHALL shuffle the deck using a cryptographically secure random source. Production code MUST use `java.security.SecureRandom`; `java.util.Random` MUST NOT be used anywhere in the engine. The random source SHALL be injectable via the `java.util.random.RandomGenerator` interface so tests can supply a seeded generator for reproducibility.

#### Scenario: Production shuffling uses SecureRandom
- **WHEN** the engine shuffles a deck without an explicitly supplied random source
- **THEN** it uses a `SecureRandom` instance

#### Scenario: java.util.Random is banned
- **WHEN** the architecture test suite analyses classes in the `cardwar.engine` package
- **THEN** no class in that package references `java.util.Random`

#### Scenario: Seeded generator produces reproducible order
- **WHEN** two decks are shuffled with `RandomGenerator` instances constructed from the same seed
- **THEN** both decks end up in an identical card order

### Requirement: Dealing and trump selection
On duel start the engine SHALL deal six cards to each of the two players, reveal the bottom card of the remaining talon as the trump card, and set the trump suit from that card. The revealed trump card SHALL remain the last card drawn from the talon.

#### Scenario: Initial deal
- **WHEN** a duel is started for two players
- **THEN** each player holds exactly 6 cards
- **AND** the talon holds exactly 24 cards
- **AND** the trump suit equals the suit of the talon's bottom card

#### Scenario: Trump card is drawn last
- **WHEN** players draw the talon down to its final card
- **THEN** the last card handed out is the revealed trump card

### Requirement: First attacker selection
The engine SHALL assign the first attacker to the player holding the lowest-ranked trump card. If neither player holds a trump card, the engine SHALL assign the first attacker to the player holding the lowest-ranked card overall; if that is also tied, it SHALL choose deterministically from the shuffled seating order.

#### Scenario: Lowest trump attacks first
- **WHEN** player A holds the six of trumps and player B holds the ace of trumps
- **THEN** player A is the attacker and player B is the defender

#### Scenario: No trumps in either hand
- **WHEN** neither player holds a trump card after the deal
- **THEN** the player holding the lowest-ranked card overall is the attacker

### Requirement: Attack move legality
The engine SHALL accept an attack only from the current attacker, only during the attacking phase, only with a card present in that player's hand, and only when the number of unresolved plus resolved attack cards on the table is below the round limit.

#### Scenario: Opening attack
- **WHEN** the attacker plays a card from their hand onto an empty table
- **THEN** the card is placed on the table as an undefended attack card
- **AND** the card is removed from the attacker's hand
- **AND** the duel enters the defending phase

#### Scenario: Defender cannot attack
- **WHEN** the defender submits an attack command
- **THEN** the engine rejects it as an illegal move and the state is unchanged

#### Scenario: Card not in hand
- **WHEN** the attacker submits an attack with a card that is not in their hand
- **THEN** the engine rejects it as an illegal move and the state is unchanged

### Requirement: Throw-in rules
After the opening attack, the attacker MAY add further attack cards, but only cards whose rank already appears on the table (as an attack card or a defence card). The engine SHALL cap the number of attack cards in a round at six, and SHALL additionally cap it at the number of cards currently in the defender's hand. Transferring the attack to the opponent (*perevod*) SHALL NOT be permitted.

#### Scenario: Throw-in with a matching rank
- **WHEN** a nine is already on the table and the attacker plays another nine
- **THEN** the card is accepted as an additional attack card

#### Scenario: Throw-in with a non-matching rank
- **WHEN** no card of rank queen is on the table and the attacker plays a queen as a throw-in
- **THEN** the engine rejects it as an illegal move

#### Scenario: Throw-in limited by defender hand size
- **WHEN** the defender holds two cards and one attack card is already unresolved on the table
- **THEN** the attacker may add at most one further attack card

#### Scenario: Round capped at six attack cards
- **WHEN** six attack cards are already on the table
- **THEN** any further attack command is rejected as an illegal move

### Requirement: Defence move legality
The engine SHALL accept a defence only from the current defender, only against a specific undefended attack card on the table, and only with a card from the defender's hand that beats it. A non-trump card beats another card only when it shares the attack card's suit and has a higher rank. A trump card beats any non-trump card. A trump card is beaten only by a higher-ranked trump card.

#### Scenario: Beating with a higher card of the same suit
- **WHEN** the attack card is the eight of hearts and the defender plays the ten of hearts
- **THEN** the defence is accepted and the attack card is marked defended

#### Scenario: Beating with a trump
- **WHEN** the attack card is the ace of hearts, the trump suit is spades, and the defender plays the six of spades
- **THEN** the defence is accepted

#### Scenario: Trump cannot be beaten by a non-trump
- **WHEN** the attack card is the six of trumps and the defender plays the ace of a non-trump suit
- **THEN** the engine rejects the move as illegal

#### Scenario: Lower card of the same suit is rejected
- **WHEN** the attack card is the ten of hearts and the defender plays the eight of hearts
- **THEN** the engine rejects the move as illegal

#### Scenario: Defending an already-defended card
- **WHEN** the defender targets an attack card that has already been beaten
- **THEN** the engine rejects the move as illegal

### Requirement: Taking cards
The defender MAY take at any point during the defending phase. On taking, all cards on the table — attack and defence alike — SHALL be added to the defender's hand, the round SHALL end, and the attacker SHALL remain the attacker for the following round.

#### Scenario: Defender takes
- **WHEN** the defender issues a take command with three attack cards and one defence card on the table
- **THEN** all four cards move into the defender's hand
- **AND** the table is emptied
- **AND** the same player attacks in the next round

### Requirement: Ending an attack and successful defence
The attacker MAY end the attack once every attack card on the table has been beaten. On ending the attack, all table cards SHALL move to the discard pile and the defender SHALL become the attacker for the following round. The attacker MUST NOT end the attack while an undefended attack card remains on the table.

#### Scenario: Successful defence resolves the round
- **WHEN** all attack cards have been beaten and the attacker ends the attack
- **THEN** every card on the table moves to the discard pile
- **AND** the previous defender becomes the attacker

#### Scenario: Cannot end the attack with an undefended card
- **WHEN** at least one attack card on the table is still undefended and the attacker ends the attack
- **THEN** the engine rejects the move as illegal

### Requirement: Refilling hands between rounds
At the end of each round the engine SHALL refill hands from the talon up to six cards, serving the attacker of the finished round first and the defender second, until the talon is exhausted. Players holding six or more cards SHALL NOT draw.

#### Scenario: Refill order
- **WHEN** a round ends, both players hold three cards, and the talon holds four cards
- **THEN** the attacker draws three cards and the defender draws the remaining one

#### Scenario: No refill above six cards
- **WHEN** a round ends and a player holds seven cards
- **THEN** that player draws nothing

### Requirement: Win, loss and draw conditions
The duel SHALL end once the talon is empty and at least one player has no cards left. A player with no cards remaining is out. If exactly one player has cards left, that player is the loser (the *durak*) and the opponent is the winner. If both players empty their hands in the same round resolution, the duel SHALL end as a draw.

#### Scenario: Opponent runs out of cards
- **WHEN** the talon is empty and the defender successfully beats their last card while the attacker still holds cards
- **THEN** the duel finishes with the defender as winner and the attacker as loser

#### Scenario: Draw
- **WHEN** the talon is empty and both players' hands become empty at the same round resolution
- **THEN** the duel finishes as a draw with no winner and no loser

#### Scenario: No moves accepted after the duel ends
- **WHEN** any command is submitted for a duel already in the finished phase
- **THEN** the engine rejects it as an illegal move

### Requirement: Engine never trusts the caller
The engine SHALL re-validate every command against the current duel state and MUST NOT rely on the caller having pre-validated it. Illegal commands SHALL raise a typed illegal-move error carrying a machine-readable reason, and MUST NOT be silently ignored or partially applied.

#### Scenario: Illegal move raises a typed error
- **WHEN** any command fails validation
- **THEN** the engine raises a typed illegal-move error identifying the reason
- **AND** no partial change is applied to the duel state
