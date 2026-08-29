# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Positioned the `G` (guess) pin marker directly on the center of the specific subdivision/region when players include an optional subdivision in their country guess (e.g. `!g US, California`).
- Added Portuguese aliases for all Spanish provinces and autonomous communities (e.g., `corunha`, `sevilha`, `saragoca`, `biscaia`, `castelhao`, `madri`, `valhadoli`, `conca`, `catalunha`, `pais basco`, `galiza`, `aragao`, `estremadura`).
- Enhanced `!aliases` command to query subdivisions and aliases for any country (e.g. `!aliases canada`, `!aliases pt`, `!aliases us, california`, `!aliases sask`) regardless of current map mode.
- Added country aliases (`guat`, `bots`, `thai`, `phili`, `cambo`, `bangla`, `mex`, `colo`, `kpop`) and Canada subdivision alias (`sask` for Saskatchewan).
- Added a result embed callout (`🎯 **Right subdivision!** <@user> earned **double XP**!`) when players guess the optional subdivision correctly in Country Streak mode.
- Added visual map rendering for round results in all game modes:
  - In Country mode: highlights the correct country in green, and the guessed country in red when incorrect, on a world map.
  - In Subdivision mode: highlights the correct subdivision in green, and the guessed subdivision in red when incorrect, on the country's subdivision map.
- Added comprehensive subdivision aliases for Portugal, Argentina, Australia, Brazil, Canada, Chile, Colombia, India, Indonesia, Japan, Kazakhstan, Italy, the Philippines, Russia, South Africa, and the United States.
- Added current local subdivision definitions missing from the bundled ISO dataset, including Christmas Island, Cocos Islands, Jervis Bay Territory, Ñuble, newer Indonesian and Kazakh subdivisions, and the Negros Island Region.
- Added a per-subdivision accuracy breakdown to `!acc <subdivision-map>`, showing each answered subdivision's percentage and correct-answer count.

### Changed

- Switched the Portugal subdivision map to [A True Portugal](https://www.geoguessr.com/maps/69ab93c917013e56097d6653).
- Added the `true portugal` map shortcut; `portugal` continues to select the Portugal subdivision map.