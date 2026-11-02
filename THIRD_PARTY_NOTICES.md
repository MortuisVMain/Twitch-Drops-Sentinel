# Third-party notices

Twitch Drops Sentinel builds on two open-source projects. Their licenses stay in force for the code taken from them.

## TwitchDropsMiner

The Twitch farming core in `core/` (Twitch API client, channel watching, drop and inventory handling) is derived from
[TwitchDropsMiner](https://github.com/DevilXD/TwitchDropsMiner) by DevilXD, licensed under the MIT License:

```
MIT License

Copyright (c) 2024 DevilXD

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## free-games-claimer

The giveaways module in `giveaways_engine/` (store scripts for Epic Games, GOG, Steam, Fab, Unity, itch.io and
Prime Gaming) is derived from [free-games-claimer](https://github.com/vogler/free-games-claimer) by Ralf Vogler,
licensed under the GNU Affero General Public License v3.0. That directory is distributed under the same license; the
full text is in [`giveaways_engine/LICENSE`](giveaways_engine/LICENSE), and its source is this repository.

## Everything else

The rest of the project (desktop shell, user interface, service layer, tooling) is licensed under the MIT License,
see [`LICENSE`](LICENSE).
