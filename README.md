# Running StArches

Steps:

1. Copy heritage assets into the `prebuild/business_data` directory
2. Point `arches_render.py` to them
3. Run `arches_render.py`
4. Run `hugo`
5. Run `npm run reindex`
6. Run `hugo serve`

Do not forget to remove old `static/heritageassets` data before re-running.
