package cardwar.monetization.service;

import cardwar.exception.ApplicationException;
import cardwar.exception.NotFoundException;
import cardwar.monetization.dto.CoinPackView;
import cardwar.monetization.dto.InvoiceView;
import cardwar.monetization.payment.PaymentGateway;
import cardwar.security.telegram.TelegramProperties;
import cardwar.wallet.dto.CoinKind;
import cardwar.wallet.service.WalletService;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Coin packs bought with Telegram Stars. Prices live here only. The invoice payload names the player and the pack
 * and is signed with a key derived from the bot token, so a payment can only credit what was actually invoiced; the
 * Telegram charge id makes the credit idempotent. Payloads are never logged.
 */
@Slf4j
@Service
public class StarsService {

    static final List<CoinPackView> PACKS = List.of(
            new CoinPackView("coins-1000", 1000, 50),
            new CoinPackView("coins-5500", 5500, 250),
            new CoinPackView("coins-12000", 12000, 500));

    private final WalletService wallets;
    private final ObjectProvider<PaymentGateway> gateway;
    private final byte[] key;
    private final SecureRandom random = new SecureRandom();

    public StarsService(WalletService wallets, ObjectProvider<PaymentGateway> gateway, TelegramProperties telegram) {
        this.wallets = wallets;
        this.gateway = gateway;
        this.key = telegram.hasBotToken() ? derive(telegram.botToken()) : null;
    }

    public List<CoinPackView> packs() {
        return PACKS;
    }

    public InvoiceView invoice(UUID playerId, String packId) {
        CoinPackView pack = pack(packId).orElseThrow(() -> new NotFoundException("No such coin pack"));
        PaymentGateway payments = gateway.getIfAvailable();
        Optional<String> link = payments == null
                ? Optional.empty()
                : payments.createStarsInvoiceLink(
                        pack.coins() + " монет", "Монети для Cardwar", payloadFor(playerId, packId), pack.stars());
        return new InvoiceView(link.orElseThrow(() -> new ApplicationException(
                HttpStatus.SERVICE_UNAVAILABLE, "Payments are unavailable right now", "PAYMENTS_UNAVAILABLE")));
    }

    public String payloadFor(UUID playerId, String packId) {
        byte[] nonce = new byte[6];
        random.nextBytes(nonce);
        String body = playerId + "." + packId + "." + HexFormat.of().formatHex(nonce);
        return body + "." + sign(body);
    }

    /** Whether a payload is ours, unaltered, for this pack, at this many Stars. */
    public boolean verify(String payload, String packId, long amount) {
        Optional<String[]> parts = parse(payload);
        if (parts.isEmpty() || !parts.get()[1].equals(packId)) {
            return false;
        }
        return pack(packId).map(pack -> pack.stars() == amount).orElse(false);
    }

    /** Pre-checkout: the pack id comes from the payload itself. */
    public boolean verify(String payload, long amount) {
        return parse(payload).map(parts -> verify(payload, parts[1], amount)).orElse(false);
    }

    /** Credits a successful payment once per Telegram charge id; false when the payload does not verify. */
    public boolean credit(String payload, long amount, String chargeId) {
        Optional<String[]> parts = parse(payload);
        if (parts.isEmpty() || !verify(payload, parts.get()[1], amount)) {
            log.warn("Rejected a Stars payment that does not match its invoice");
            return false;
        }
        UUID player = UUID.fromString(parts.get()[0]);
        long coins = pack(parts.get()[1]).orElseThrow().coins();
        boolean applied = wallets.credit(player, coins, CoinKind.STARS_TOPUP, "stars:" + chargeId);
        if (applied) {
            log.info("Credited a Stars top-up to player {}", player);
        }
        return true;
    }

    private Optional<String[]> parse(String payload) {
        if (key == null || payload == null) {
            return Optional.empty();
        }
        String[] parts = payload.split("\\.");
        if (parts.length != 4) {
            return Optional.empty();
        }
        String body = parts[0] + "." + parts[1] + "." + parts[2];
        if (!MessageDigest.isEqual(
                sign(body).getBytes(StandardCharsets.UTF_8), parts[3].getBytes(StandardCharsets.UTF_8))) {
            return Optional.empty();
        }
        try {
            UUID.fromString(parts[0]);
        } catch (IllegalArgumentException malformed) {
            return Optional.empty();
        }
        return Optional.of(parts);
    }

    private static Optional<CoinPackView> pack(String packId) {
        return PACKS.stream().filter(pack -> pack.id().equals(packId)).findFirst();
    }

    private String sign(String body) {
        if (key == null) {
            return "";
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException impossible) {
            throw new IllegalStateException("HmacSHA256 is a required JDK algorithm", impossible);
        }
    }

    private static byte[] derive(String botToken) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(botToken.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal("cardwar-invoice".getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException impossible) {
            throw new IllegalStateException("HmacSHA256 is a required JDK algorithm", impossible);
        }
    }
}
