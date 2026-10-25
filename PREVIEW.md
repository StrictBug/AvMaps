# AvMaps preview site

This repository (`AvMaps-preview`) is a **staging** copy used to test ICON/GFS changes without updating the live production site.

| Site | URL |
|------|-----|
| Production | https://strictbug.github.io/AvMaps/ |
| Preview | https://strictbug.github.io/AvMaps-preview/ |

## Refresh the preview

In this repo: **Actions → Build and deploy aviation maps → Run workflow**, set **force = true**.

Or:

```bash
gh workflow run auto-update-maps.yml --ref main -f force=true
gh run watch
```

A full generate (hours 6–48, GFS+ICON) can take on the order of 1–2 hours.
