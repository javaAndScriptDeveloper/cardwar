# Entitlements

## Purpose

Entitlements are the freemium ownership model: what it means for a player to own a skin or theme, the unlock rules that grant ownership, and the pluggable grant sources behind those rules. Payment integration is stubbed so a real store (such as Telegram Stars) can be added as another grant source without changing how ownership is checked.

## Requirements

### Requirement: Ownership model
The system SHALL model an entitlement as a record that a specific player owns a specific card skin or deck theme, carrying the source that granted it, the grant timestamp and an optional expiry. A player MUST NOT hold two active entitlements for the same target.

#### Scenario: Granting an entitlement
- **WHEN** a skin is granted to a player
- **THEN** an entitlement row records the player, the target, the grant source and the grant timestamp

#### Scenario: Duplicate grant rejected
- **WHEN** a skin already owned by a player is granted again
- **THEN** the operation is rejected and no second entitlement row is created

#### Scenario: Expired entitlement is not ownership
- **WHEN** an entitlement's expiry has passed
- **THEN** the player is not considered to own that target

### Requirement: Unlock rules are data
The conditions under which a skin or theme can be unlocked — free, gameplay progress threshold, in-game currency price, or real-money purchase — SHALL be stored as data with a rule type and its parameters, not encoded as constants in application code.

#### Scenario: Changing an unlock threshold
- **WHEN** an operator changes a progress rule's threshold from ten to twenty duels won
- **THEN** unlock attempts are evaluated against the new threshold with no code change

#### Scenario: Target with no rule cannot be unlocked
- **WHEN** a player attempts to unlock a target that has no unlock rule
- **THEN** the request is rejected and no entitlement is granted

### Requirement: Pluggable grant sources
Each unlock rule type SHALL be served by an `EntitlementGrantSource` implementation selected at runtime by rule type. Adding a new way to acquire a skin SHALL require adding an implementation, not modifying the entitlement service.

#### Scenario: Free unlock
- **WHEN** a player unlocks a target whose rule type is free
- **THEN** the entitlement is granted immediately with the free source recorded

#### Scenario: Progress unlock met
- **WHEN** a player whose duels-won count meets a progress rule's threshold unlocks that target
- **THEN** the entitlement is granted with the progress source recorded

#### Scenario: Progress unlock not met
- **WHEN** a player whose duels-won count is below the threshold attempts the unlock
- **THEN** the request is rejected with a 400 problem detail and no entitlement is granted

#### Scenario: Currency unlock deducts balance
- **WHEN** a player with sufficient in-game currency unlocks a priced target
- **THEN** the entitlement is granted and the price is deducted from their balance

#### Scenario: Insufficient currency
- **WHEN** a player with insufficient in-game currency attempts a currency unlock
- **THEN** the request is rejected, no entitlement is granted, and the balance is unchanged

### Requirement: Purchases are stubbed, not implemented
The real-money purchase grant source SHALL exist as an interface implementation that explicitly reports the capability as unavailable in this phase. No payment provider integration, payment credential, or money movement SHALL be implemented.

#### Scenario: Purchase unlock attempted
- **WHEN** a player attempts to unlock a target whose rule type is purchase
- **THEN** the API responds indicating the capability is not available yet
- **AND** no entitlement is granted and no external call is made

#### Scenario: Seam is ready for a future provider
- **WHEN** a payment provider is added in a later phase
- **THEN** it can be introduced as an additional grant source implementation without changing the entitlement service

### Requirement: Collection is readable
The system SHALL expose the authenticated player's owned skins and themes, and SHALL report for each catalog target whether the player owns it and, when not, how it can be unlocked.

#### Scenario: Reading the collection
- **WHEN** an authenticated player requests their collection
- **THEN** the response lists each owned skin and theme with its grant source

#### Scenario: Locked target shows its unlock path
- **WHEN** a player views a catalog target they do not own
- **THEN** the response reports it as locked together with the rule type and parameters required to unlock it
