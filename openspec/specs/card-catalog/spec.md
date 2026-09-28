# Card Catalog

## Purpose

The card catalog holds data-driven deck themes, card skins, rarities and scoring multipliers. Skins are resolved by rank and suit and served to clients from the catalog, so the Durak engine never sees presentation data and a new or retired skin is a data change rather than a code change or redeploy.

## Requirements

### Requirement: Skins are data, not code
Card skins, deck themes, rarities and multipliers SHALL be stored as data in Postgres. Adding a new skin, retiring one, or reassigning a character to a different rank or suit SHALL require only a data change — no code change and no redeploy of engine logic.

#### Scenario: Reassigning a character to a different card
- **WHEN** an operator updates a card skin row to point at a different rank and suit
- **AND** the catalog cache is evicted or expires
- **THEN** clients resolving that theme receive the character on its new rank and suit
- **AND** no application code was changed or redeployed

#### Scenario: Adding a new skin
- **WHEN** an operator inserts a new card skin row for a theme
- **THEN** that skin is served by the catalog without any code change

### Requirement: Deck theme model
The catalog SHALL model a deck theme as a named, uniquely coded collection of card skins. Exactly one theme SHALL be marked as the default. Within a single theme, each combination of rank and suit SHALL map to at most one skin.

#### Scenario: Theme uniqueness constraint
- **WHEN** a second skin is inserted for a rank and suit that already has a skin in the same theme
- **THEN** the database rejects the insert on a uniqueness constraint

#### Scenario: Default theme is served to players with no selection
- **WHEN** a player who has selected no theme requests the catalog
- **THEN** the theme marked as default is returned

### Requirement: Card skin model
The catalog SHALL model a card skin with a unique code, a display name, the rank and suit it renders, an image reference, an owning theme, a rarity, an optional multiplier override, and an active flag. Inactive skins SHALL NOT be served to clients.

#### Scenario: Inactive skins are hidden
- **WHEN** a card skin is marked inactive
- **THEN** it is excluded from catalog responses

### Requirement: Rarity and configurable multipliers
The catalog SHALL model rarity as data carrying a default scoring multiplier. A card skin's effective multiplier SHALL be its own multiplier override when one is set, and its rarity's default multiplier otherwise. Multipliers MUST NOT be hard-coded as constants in application code.

#### Scenario: Multiplier inherited from rarity
- **WHEN** a skin has no multiplier override and its rarity default multiplier is 1.5
- **THEN** the skin's effective multiplier is 1.5

#### Scenario: Multiplier override wins
- **WHEN** a skin has a multiplier override of 3.0 and its rarity default multiplier is 1.5
- **THEN** the skin's effective multiplier is 3.0

#### Scenario: Changing a rarity multiplier affects all its skins
- **WHEN** a rarity's default multiplier is updated
- **THEN** every skin of that rarity without an override reports the new effective multiplier

### Requirement: Skins never affect game logic
The engine SHALL remain unaware of skins, themes, rarities and multipliers. Skin data SHALL be applied only when presenting duel state outward, and MUST NOT influence card rank, suit, legality of any move, shuffle outcome, or win probability.

#### Scenario: Engine package has no catalog dependency
- **WHEN** the architecture test suite analyses classes in the `cardwar.engine` package
- **THEN** no class in that package references the `cardwar.catalog` package

#### Scenario: Two players on different themes play the same game
- **WHEN** two players in the same duel have different deck themes selected
- **THEN** both see identical ranks, suits and legal moves, differing only in rendered skin

### Requirement: Seeded catalog data
The initial database migration SHALL seed a complete 36-card neutral classic theme plus at least one example themed deck. Example themes SHALL use fictional placeholder characters only; skins named after real, identifiable public figures MUST NOT be seeded in this change.

#### Scenario: Classic theme completeness
- **WHEN** the application starts against a freshly migrated database
- **THEN** the classic theme contains exactly 36 active skins covering every rank and suit

#### Scenario: No real public figures in seed data
- **WHEN** the seeded skin display names are reviewed
- **THEN** none of them names a real, identifiable public figure

### Requirement: Catalog read API
The catalog SHALL expose a read API returning the themes available and the rank-and-suit-to-skin mapping for a given theme, including each skin's rarity and effective multiplier. Catalog reads SHALL be cached, since the data is small and changes rarely.

#### Scenario: Fetching a theme mapping
- **WHEN** an authenticated client requests a theme by code
- **THEN** the response contains one entry per active skin with its rank, suit, display name, image reference, rarity and effective multiplier

#### Scenario: Unknown theme
- **WHEN** a client requests a theme code that does not exist
- **THEN** the API responds with 404 and an RFC 9457 problem detail

#### Scenario: Repeated reads are served from cache
- **WHEN** the same theme is requested twice within the cache window
- **THEN** the second request is served without querying the database
