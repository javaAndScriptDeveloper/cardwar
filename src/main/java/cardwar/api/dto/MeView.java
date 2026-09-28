package cardwar.api.dto;

import cardwar.account.dto.PlayerSummary;
import cardwar.account.dto.ProgressView;
import cardwar.monetization.dto.CollectionView;

/**
 * Everything a client needs to render the profile screen in one round trip. It lives in the cross-cutting api
 * module rather than in either contributing module: an aggregate that reaches into two modules would otherwise
 * make those two modules depend on each other.
 */
public record MeView(PlayerSummary player, ProgressView progress, CollectionView collection) {}
