package cardwar.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** {@code window.Telegram.WebApp.initData}, verbatim. It is a credential and is never logged. */
public record TelegramAuthRequest(@NotBlank @Size(max = 8192) String initData) {}
