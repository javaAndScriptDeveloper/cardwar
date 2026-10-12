package cardwar.session.dto;

import jakarta.validation.constraints.NotNull;

public record EnterMatchmakingRequest(@NotNull Long stake) {}
