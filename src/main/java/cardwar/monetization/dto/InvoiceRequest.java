package cardwar.monetization.dto;

import jakarta.validation.constraints.NotBlank;

public record InvoiceRequest(@NotBlank String packId) {}
