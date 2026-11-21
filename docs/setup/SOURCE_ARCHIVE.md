# Source archive

Use the pinned Node and pnpm versions and Python 3. Run this from a Git checkout.

```sh
pnpm archive
pnpm archive --output /absolute/path/telegram-system-source.zip
unzip -t /absolute/path/telegram-system-source.zip
```

The default output is `telegram-system.zip` in the repository root. To invoke
the archive tool from another directory, pass its absolute path to Python
and specify an absolute output path.

```sh
python3 /path/to/Telegram-App/scripts/build/source-archive.py --output /absolute/path/telegram-system-source.zip
```

The ZIP contains the current working copies of tracked and non-ignored source
files, including uncommitted sources. It includes assets, migrations, CI
configuration and safe environment templates. It omits Git metadata,
symlinks, local credentials, private lead-review data, database dumps and
backups, graph caches and local graph databases, dependencies, generated
build outputs and other archives. Re-creating the ZIP replaces the previous
archive atomically after ZIP integrity validation.

Unpack into an empty directory. Set up the required ignored environment
files from the included examples and use `pnpm install --frozen-lockfile`.
The unpacked project supports local builds. Commands that require Git
history, hooks installation or source archive creation require a Git checkout.
