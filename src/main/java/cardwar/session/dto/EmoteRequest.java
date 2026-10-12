package cardwar.session.dto;

import jakarta.validation.constraints.NotBlank;

public record EmoteRequest(@NotBlank String code) {}
