package cardwar.monetization.dto;

import java.util.List;

public record CollectionView(List<OwnedItemView> owned, List<LockedItemView> locked) {}
