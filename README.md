# Ghost Hunters TV

A silly multiplayer ghost-hunting TV show. One friend films, the rest host, one friend can be the ghost, and everybody else watches live from a living room on the couch.

**Play:** https://rockstarb0i.github.io/Ghost-Hunters-TV/

Online play needs the show server (`server/server.py`) running somewhere. The Server Control panel's GO PUBLIC button runs it through a tunnel and writes its address to `server.json`, which the game reads.

- `python3 server/server.py 9730` runs the game and the show server locally at http://localhost:9730
- `desktop/` holds the self-updating Windows launcher and the release/publish scripts

Made by Ruff Dogs Studios.
