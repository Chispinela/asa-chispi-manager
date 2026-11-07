"""Read player/tribe metadata from a private, stopped-server snapshot.

No game files are modified. arkparser is vendored at a pinned MIT revision.
The wrapper opens ASA SQLite read-only and reads only the embedded store,
not the full world object graph. Sidecar files supplement embedded records.
"""
import json
import logging
import re
import sqlite3
import sys
from pathlib import Path

from arkparser import Profile, Tribe
from arkparser.files.embedded_store import load_embedded_store

logging.disable(logging.CRITICAL)


def eos(value):
    value = str(value or "")
    match = re.search(r"(?:^|[^a-zA-Z0-9])([a-zA-Z0-9]{32})(?:$|[^a-zA-Z0-9])", value)
    return match.group(1) if match else ""


def collect(world):
    profiles, tribes, warnings = [], [], []
    with world.open("rb") as stream:
        header = stream.read(16)
    if header != b"SQLite format 3\x00":
        raise ValueError("This is not a supported ASA SQLite world save.")
    with sqlite3.connect(world.resolve().as_uri() + "?mode=ro", uri=True) as connection:
        store = load_embedded_store(connection)
        profiles.extend(store.profiles)
        tribes.extend(store.tribes)
        warnings.extend(store.errors)
    embedded_count = len(profiles)
    for directory in [world.parent, world.parent / "Players", world.parent / "Tribes"]:
        if not directory.is_dir():
            continue
        for extension, loader, target in [("*.arkprofile", Profile, profiles), ("*.arktribe", Tribe, tribes)]:
            for source in directory.glob(extension):
                try:
                    target.append(loader.load(source))
                except Exception as error:
                    warnings.append(f"{source.name}: {error}")
    tribe_names, tribe_by_player = {}, {}
    for tribe in tribes:
        if tribe.tribe_id is None:
            continue
        # First record wins: the embedded store represents the chosen world.
        tribe_names.setdefault(str(tribe.tribe_id), tribe.name or "")
        for member in tribe.member_ids:
            tribe_by_player.setdefault(str(member), str(tribe.tribe_id))
    records = {}
    unresolved = []
    for profile in profiles:
        account = eos(profile.unique_id)
        if not account and profile.source_path:
            account = eos(profile.source_path.stem)
        player_id = str(profile.player_id) if profile.player_id is not None else ""
        if not account:
            unresolved.append({"characterName": profile.character_name or "", "playerId": player_id})
            continue
        tribe_id = tribe_by_player.get(player_id)
        if tribe_id is None:
            tribe_id = str(profile.raw_tribe_id) if profile.raw_tribe_id is not None else ""
        records.setdefault(account, {
            "accountId": account,
            "name": profile.player_name or "",
            "characterName": profile.character_name or "",
            "playerId": player_id,
            "tribeId": tribe_id,
            "tribeName": tribe_names.get(tribe_id, ""),
        })
    return {"players": list(records.values()), "warnings": warnings, "unresolved": unresolved,
            "embeddedProfiles": embedded_count, "parser": "arkparser 0.9.0"}


if __name__ == "__main__":
    try:
        result = collect(Path(sys.argv[1]))
        Path(sys.argv[2]).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        print(json.dumps({"players": len(result["players"]), "warnings": len(result["warnings"])}))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
