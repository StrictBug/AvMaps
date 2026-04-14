#!/usr/bin/env python3
"""Automatically refresh AvMaps when a fully available model run is ready."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys

import requests

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
os.chdir(REPO_ROOT)

from generate_maps import (  # noqa: E402
    data_lat_max,
    data_lat_min,
    data_lon_max,
    data_lon_min,
    generate_all_layers_atomically,
    get_latest_gfs_dataset,
    get_latest_icon_run,
)

GFS_FILTER_URL = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl'
MIN_GFS_READY_BYTES = 1000
ICON_BG_PRESSURE_LEVELS_HPA = [1000, 950, 900, 850, 500]
PUBLISHED_MANIFEST_URL = 'https://strictbug.github.io/AvMaps/images/manifest.json'


def extract_run_stamp_from_path(path: str | None) -> str | None:
    if not path:
        return None

    match = re.search(r'_(\d{8}_\d{2})_\d{2,3}\.[^.]+$', Path(path).name)
    return match.group(1) if match else None


def load_manifest_payload() -> dict | None:
    manifest_path = REPO_ROOT / 'images' / 'manifest.json'
    if manifest_path.exists():
        with manifest_path.open('r', encoding='utf-8') as manifest_file:
            return json.load(manifest_file)

    try:
        response = requests.get(PUBLISHED_MANIFEST_URL, timeout=60)
        response.raise_for_status()
        return response.json()
    except requests.RequestException:
        return None


def read_published_run_stamps() -> dict[str, str | None]:
    manifest = load_manifest_payload()
    if not manifest:
        return {'gfs': None, 'icon': None}

    bg_frames = manifest.get('domains', {}).get('AU', {}).get('categories', {}).get('BG') or []
    if not bg_frames:
        return {'gfs': None, 'icon': None}

    first_bg_frame = bg_frames[0]
    return {
        'gfs': extract_run_stamp_from_path(first_bg_frame.get('leftPath')),
        'icon': extract_run_stamp_from_path(first_bg_frame.get('rightPath')),
    }


def gfs_hour_is_ready(init_time, forecast_hour: int) -> bool:
    run_date = init_time.strftime('%Y%m%d')
    run_cycle = init_time.strftime('%H')
    grib_file = f'gfs.t{run_cycle}z.pgrb2.0p25.f{forecast_hour:03d}'

    params = {
        'file': grib_file,
        'dir': f'/gfs.{run_date}/{run_cycle}/atmos',
        'subregion': '',
        'leftlon': str(data_lon_min),
        'rightlon': str(data_lon_max),
        'toplat': str(data_lat_max),
        'bottomlat': str(data_lat_min),
        'var_PRMSL': 'on',
        'lev_mean_sea_level': 'on',
    }

    response = requests.get(GFS_FILTER_URL, params=params, timeout=120)
    response.raise_for_status()
    return len(response.content) >= MIN_GFS_READY_BYTES


def icon_url_is_ready(url: str) -> bool:
    response = requests.get(url, stream=True, timeout=120)
    try:
        response.raise_for_status()
        return True
    finally:
        response.close()


def build_icon_bg_urls(icon_run: dict[str, str], forecast_hour: int, previous_hour: int | None = None) -> list[str]:
    base_url = icon_run['base_url']
    cycle = icon_run['cycle']
    run_stamp = icon_run['run_stamp']
    fh = f'{forecast_hour:03d}'

    urls = [
        f'{base_url}/{cycle}/pmsl/icon_global_icosahedral_single-level_{run_stamp}_{fh}_PMSL.grib2.bz2',
        f'{base_url}/{cycle}/u_10m/icon_global_icosahedral_single-level_{run_stamp}_{fh}_U_10M.grib2.bz2',
        f'{base_url}/{cycle}/v_10m/icon_global_icosahedral_single-level_{run_stamp}_{fh}_V_10M.grib2.bz2',
        f'{base_url}/{cycle}/t_2m/icon_global_icosahedral_single-level_{run_stamp}_{fh}_T_2M.grib2.bz2',
        f'{base_url}/{cycle}/td_2m/icon_global_icosahedral_single-level_{run_stamp}_{fh}_TD_2M.grib2.bz2',
        f'{base_url}/{cycle}/tot_prec/icon_global_icosahedral_single-level_{run_stamp}_{fh}_TOT_PREC.grib2.bz2',
    ]

    for level_hpa in ICON_BG_PRESSURE_LEVELS_HPA:
        urls.append(
            f'{base_url}/{cycle}/fi/icon_global_icosahedral_pressure-level_{run_stamp}_{fh}_{level_hpa}_FI.grib2.bz2'
        )
        urls.append(
            f'{base_url}/{cycle}/relhum/icon_global_icosahedral_pressure-level_{run_stamp}_{fh}_{level_hpa}_RELHUM.grib2.bz2'
        )

    if previous_hour is not None and previous_hour >= 0:
        prev_fh = f'{previous_hour:03d}'
        urls.append(
            f'{base_url}/{cycle}/tot_prec/icon_global_icosahedral_single-level_{run_stamp}_{prev_fh}_TOT_PREC.grib2.bz2'
        )

    return urls


def icon_hour_is_ready(icon_run: dict[str, str], forecast_hour: int, previous_hour: int | None = None) -> bool:
    return all(icon_url_is_ready(url) for url in build_icon_bg_urls(icon_run, forecast_hour, previous_hour))


def write_github_output(path: str | None, values: dict[str, str]) -> None:
    if not path:
        return

    with open(path, 'a', encoding='utf-8') as output_file:
        for key, value in values.items():
            output_file.write(f'{key}={value}\n')


def latest_runs_are_ready(start_hour: int, end_hour: int, model: str) -> tuple[bool, dict[str, str | None]]:
    published = read_published_run_stamps()
    status: dict[str, str | None] = {
        'published_gfs': published['gfs'],
        'published_icon': published['icon'],
        'latest_gfs': None,
        'latest_icon': None,
    }

    gfs_init_time = None
    if model in ('gfs', 'both'):
        _, gfs_init_time = get_latest_gfs_dataset()
        latest_gfs_stamp = gfs_init_time.strftime('%Y%m%d_%H')
        status['latest_gfs'] = latest_gfs_stamp

        gfs_hours_to_check = {end_hour}
        if start_hour > 0:
            gfs_hours_to_check.add(start_hour - 1)

        for hour in sorted(gfs_hours_to_check):
            ready = gfs_hour_is_ready(gfs_init_time, hour)
            print(f'GFS readiness for {latest_gfs_stamp} hour {hour:02d}: {ready}')
            if not ready:
                return False, status

    if model in ('icon', 'both'):
        icon_run = get_latest_icon_run(target_time=gfs_init_time if model == 'both' else None)
        latest_icon_stamp = icon_run['init_time'].strftime('%Y%m%d_%H')
        status['latest_icon'] = latest_icon_stamp

        previous_hour = start_hour - 1 if start_hour > 0 else None
        icon_ready = icon_hour_is_ready(icon_run, end_hour, previous_hour=previous_hour)
        print(f'ICON readiness for {latest_icon_stamp} hour {end_hour:02d}: {icon_ready}')
        if not icon_ready:
            return False, status

    return True, status


def main() -> int:
    parser = argparse.ArgumentParser(description='Automatically update AvMaps when a fully available run is ready.')
    parser.add_argument('--model', choices=['gfs', 'icon', 'both'], default='both')
    parser.add_argument('--start-hour', type=int, default=9)
    parser.add_argument('--end-hour', type=int, default=48)
    parser.add_argument('--check-only', action='store_true', help='Only report readiness; do not generate maps.')
    parser.add_argument('--force', action='store_true', help='Generate even if the latest ready run already appears to be published.')
    parser.add_argument('--github-output', help='Optional GitHub Actions output file path.')
    args = parser.parse_args()

    ready, status = latest_runs_are_ready(args.start_hour, args.end_hour, args.model)

    github_output = {
        'published_gfs': status['published_gfs'] or '',
        'published_icon': status['published_icon'] or '',
        'latest_gfs': status['latest_gfs'] or '',
        'latest_icon': status['latest_icon'] or '',
    }

    print(f"Published GFS run: {status['published_gfs']}")
    print(f"Published ICON run: {status['published_icon']}")
    print(f"Latest ready GFS run: {status['latest_gfs']}")
    print(f"Latest ready ICON run: {status['latest_icon']}")

    if not ready:
        print('The latest model run is not fully available yet. No update will be published.')
        write_github_output(args.github_output, {
            **github_output,
            'should_deploy': 'false',
            'reason': 'model_run_not_ready',
        })
        return 0

    already_current = True
    if args.model in ('gfs', 'both'):
        already_current &= status['published_gfs'] == status['latest_gfs']
    if args.model in ('icon', 'both'):
        already_current &= status['published_icon'] == status['latest_icon']

    if already_current and not args.force:
        print('The site is already showing the latest fully available run. No update is needed.')
        write_github_output(args.github_output, {
            **github_output,
            'should_deploy': 'false',
            'reason': 'already_current',
        })
        return 0

    if args.check_only:
        print('A newer fully available run is ready for publishing.')
        write_github_output(args.github_output, {
            **github_output,
            'should_deploy': 'false',
            'reason': 'ready_but_check_only',
        })
        return 0

    print('Starting atomic full-run publish...')
    generate_all_layers_atomically(
        list(range(args.start_hour, args.end_hour + 1)),
        model=args.model,
    )
    print('Automatic update finished successfully.')
    write_github_output(args.github_output, {
        **github_output,
        'should_deploy': 'true',
        'reason': 'site_published',
    })
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
