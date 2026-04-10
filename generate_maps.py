import matplotlib.pyplot as plt
from matplotlib.colors import BoundaryNorm, ListedColormap
import argparse
import bz2
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from cartopy.io.shapereader import Reader, natural_earth
from cartopy.feature import ShapelyFeature
from shapely.geometry import Point
from shapely.prepared import prep
from shapely.ops import unary_union
from siphon.catalog import TDSCatalog
import xarray as xr
import numpy as np
from datetime import datetime, timedelta, timezone
import os
import shutil
import tempfile
import requests
import re
from concurrent.futures import ThreadPoolExecutor
from scipy.spatial import cKDTree
import pandas as pd

# Define the Australia domain
# SW corner: 47°57'S, 103°34'E
# NE corner: 22°33'S, 172°7'E
lat_min = -47.95  # 47°57'S
lat_max = -22.55  # 22°33'S
lon_min = 103.5667  # 103°34'E
lon_max = 172.1167  # 172°7'E

REMOVABLE_IMAGE_EXTS = ('.png', '.jpg', '.jpeg', '.gif', '.webp')
TAF_LABEL_DX = -0.12
TAF_LABEL_DY = 0.12

# On-disk cache for downloaded ICON GRIB2 files.  Each entry is the raw
# decompressed bytes keyed by run_stamp + folder + filename so that repeated
# runs (e.g. a single-frame re-render) skip the network entirely.
ICON_CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.icon_cache')


def safe_remove_file(path):
    try:
        os.remove(path)
    except OSError:
        pass


def publish_generated_frames(output_dir, generated_files, temp_dir):
    removed_count = 0
    for entry in os.listdir(output_dir):
        file_path = os.path.join(output_dir, entry)
        if os.path.isfile(file_path) and entry.lower().endswith(REMOVABLE_IMAGE_EXTS):
            os.remove(file_path)
            removed_count += 1

    for filename in sorted(generated_files):
        shutil.move(os.path.join(temp_dir, filename), os.path.join(output_dir, filename))

    print(f'Removed {removed_count} previously published frames from {output_dir}')
    print(f'Published {len(generated_files)} new frames to {output_dir}')

# Helper function to handle different GFS time dimension names
def get_time_index(data_var):
    """Get first time index, handling both 'time2' and 'validtime1' dimension names"""
    if 'time2' in data_var.dims:
        return data_var.isel(time2=0)
    elif 'validtime1' in data_var.dims:
        return data_var.isel(validtime1=0)
    else:
        # If neither, try to find the time dimension dynamically
        time_dims = [d for d in data_var.dims if 'time' in d.lower() or 'valid' in d.lower()]
        if time_dims:
            return data_var.isel({time_dims[0]: 0})
        return data_var  # Return as-is if no time dimension


def get_isobaric_field(data_var, target_pa):
    """Select an isobaric field at target pressure (Pa), falling back to nearest level."""
    return get_time_index(data_var.sel(isobaric=target_pa, method='nearest'))


def dewpoint_from_temperature_and_rh(temp_k, rh_percent):
    """Return dewpoint in Celsius from temperature (K) and relative humidity (%)."""
    temp_c = temp_k - 273.15
    rh_clipped = np.clip(rh_percent, 1e-6, 100.0)
    a = 17.625
    b = 243.04
    gamma = np.log(rh_clipped / 100.0) + (a * temp_c) / (b + temp_c)
    return (b * gamma) / (a - gamma)


def mixing_ratio_from_dewpoint_and_pressure(td_c, pressure_hpa):
    """Return humidity mixing ratio (kg/kg) from dewpoint (C) and pressure (hPa)."""
    vapor_pressure_hpa = 6.112 * np.exp((17.67 * td_c) / (td_c + 243.5))
    vapor_pressure_hpa = np.minimum(vapor_pressure_hpa, pressure_hpa - 0.01)
    epsilon = 0.622
    return (epsilon * vapor_pressure_hpa) / (pressure_hpa - vapor_pressure_hpa)


def calculate_total_totals(data):
    """Return the Total Totals index in degrees Celsius."""
    temp_850 = get_isobaric_field(data['Temperature_isobaric'], 85000)
    temp_500 = get_isobaric_field(data['Temperature_isobaric'], 50000)
    rh_850 = get_isobaric_field(data['Relative_humidity_isobaric'], 85000)

    td_850_c = dewpoint_from_temperature_and_rh(temp_850.values, rh_850.values)
    t_850_c = temp_850.values - 273.15
    t_500_c = temp_500.values - 273.15
    return t_850_c + td_850_c - 2.0 * t_500_c


def get_max_geometric_vertical_velocity(data, pressure_levels_pa):
    """Return the maximum geometric vertical velocity (m/s) across the requested levels."""
    level_values = [
        get_isobaric_field(data['Geometric_vertical_velocity_isobaric'], level).values
        for level in pressure_levels_pa
    ]
    return np.max(np.stack(level_values, axis=0), axis=0)


def get_gfs_convective_precip_accumulation(forecast_hour, init_time):
    """Fetch accumulated convective precipitation (kg/m^2 ~= mm) for one forecast hour."""
    run_date = init_time.strftime('%Y%m%d')
    run_cycle = init_time.strftime('%H')
    grib_file = f'gfs.t{run_cycle}z.pgrb2.0p25.f{forecast_hour:03d}'

    params = {
        'file': grib_file,
        'dir': f'/gfs.{run_date}/{run_cycle}/atmos',
        'subregion': '',
        'leftlon': str(lon_min),
        'rightlon': str(lon_max),
        'toplat': str(lat_max),
        'bottomlat': str(lat_min),
        'var_ACPCP': 'on',
        'lev_surface': 'on',
    }

    response = requests.get(
        'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl',
        params=params,
        timeout=240,
    )
    response.raise_for_status()

    with tempfile.NamedTemporaryFile(suffix='.grib2', delete=False) as temp_grib:
        temp_grib.write(response.content)
        temp_grib_path = temp_grib.name

    try:
        ds_surface_accum = xr.open_dataset(
            temp_grib_path,
            engine='cfgrib',
            backend_kwargs={'filter_by_keys': {'typeOfLevel': 'surface', 'stepType': 'accum'}, 'indexpath': ''},
        )
        ds_surface_accum = ds_surface_accum.load()
        return ds_surface_accum['acpcp'].values
    finally:
        safe_remove_file(temp_grib_path)


def derive_incremental_accumulation(current_values, previous_values=None):
    """Return one-step accumulation, handling source fields that periodically reset."""
    current_values = np.asarray(current_values)
    if previous_values is None:
        return np.maximum(current_values, 0.0)

    previous_values = np.asarray(previous_values)
    tolerance = 1e-6

    # Some upstream accumulated fields restart from zero at bucket boundaries.
    # When that happens, the current field already represents the latest bucket,
    # so subtracting the previous hour would wipe out most of the signal.
    if np.nanmax(current_values) + tolerance < np.nanmax(previous_values):
        return np.maximum(current_values, 0.0)

    return np.maximum(current_values - previous_values, 0.0)


def get_day_night_grid(valid_time, lons, lats):
    """Return solar-zenith proxy and night mask for a given UTC valid time."""
    day_of_year = valid_time.timetuple().tm_yday
    utc_hour = valid_time.hour + valid_time.minute / 60 + valid_time.second / 3600

    # Fractional year in radians (NOAA solar approximation)
    gamma = 2 * np.pi / 365 * (day_of_year - 1 + (utc_hour - 12) / 24)

    # Solar declination (radians)
    decl = (
        0.006918
        - 0.399912 * np.cos(gamma)
        + 0.070257 * np.sin(gamma)
        - 0.006758 * np.cos(2 * gamma)
        + 0.000907 * np.sin(2 * gamma)
        - 0.002697 * np.cos(3 * gamma)
        + 0.00148 * np.sin(3 * gamma)
    )

    # Equation of time (minutes)
    eq_time = 229.18 * (
        0.000075
        + 0.001868 * np.cos(gamma)
        - 0.032077 * np.sin(gamma)
        - 0.014615 * np.cos(2 * gamma)
        - 0.040849 * np.sin(2 * gamma)
    )

    lon_grid, lat_grid = np.meshgrid(lons, lats)
    true_solar_time = (utc_hour * 60 + eq_time + 4 * lon_grid) % 1440
    hour_angle = np.where(true_solar_time / 4 < 0, true_solar_time / 4 + 180, true_solar_time / 4 - 180)

    lat_rad = np.deg2rad(lat_grid)
    ha_rad = np.deg2rad(hour_angle)
    cos_zenith = np.sin(lat_rad) * np.sin(decl) + np.cos(lat_rad) * np.cos(decl) * np.cos(ha_rad)
    night_mask = cos_zenith < 0

    return cos_zenith, night_mask

# Function to get elevation data from GFS surface geopotential
def get_elevation_data(data=None):
    """Extract elevation from GFS/ICON surface geopotential height."""
    print("Extracting elevation from model surface geopotential...")
    geop_surface = get_time_index(data['Geopotential_height_surface'])
    
    print(f"Raw geopotential min/max: {geop_surface.values.min():.0f} / {geop_surface.values.max():.0f}")
    print(f"Variable units: {geop_surface.attrs.get('units', 'unknown')}")
    
    # GFS/ICON output surface geopotential in gpm (geopotential meters)
    # which is approximately equal to meters of elevation above sea level
    elevation = geop_surface.values
    
    lons = data.longitude.values
    lats = data.latitude.values
    
    print(f"Elevation range: {elevation.min():.0f}m / {elevation.max():.0f}m")
    
    return elevation, lons, lats

# Function to get latest GFS data
def get_latest_gfs_dataset():
    # Access GFS 0.25 degree catalog
    catalog_url = 'https://thredds.ucar.edu/thredds/catalog/grib/NCEP/GFS/Global_0p25deg/catalog.xml'
    catalog = TDSCatalog(catalog_url)

    # Get latest dataset
    latest_dataset = catalog.datasets[2]  # Latest Collection
    opendap_url = latest_dataset.access_urls['OPENDAP']
    file_part = opendap_url.split('/')[-1]  # e.g., GFS_Global_0p25deg_20260407_1800.grib2
    date_str = file_part.split('_')[3]
    hour_str = file_part.split('_')[4][:2]
    init_time = datetime.strptime(date_str + hour_str, '%Y%m%d%H').replace(tzinfo=timezone.utc)

    return latest_dataset, init_time


def get_gfs_data(forecast_hour=9, latest_dataset=None, init_time=None, include_ts_fields=False, prev_acpcp_values=None):
    if latest_dataset is None or init_time is None:
        latest_dataset, init_time = get_latest_gfs_dataset()

    if forecast_hour < 0 or forecast_hour > 120:
        raise ValueError('Raw hourly NOMADS GFS is only available for forecast hours 0-120')

    run_date = init_time.strftime('%Y%m%d')
    run_cycle = init_time.strftime('%H')
    grib_file = f'gfs.t{run_cycle}z.pgrb2.0p25.f{forecast_hour:03d}'

    params = {
        'file': grib_file,
        'dir': f'/gfs.{run_date}/{run_cycle}/atmos',
        'subregion': '',
        'leftlon': str(lon_min),
        'rightlon': str(lon_max),
        'toplat': str(lat_max),
        'bottomlat': str(lat_min),
        'var_PRMSL': 'on',
        'var_HGT': 'on',
        'var_PRATE': 'on',
        'var_UGRD': 'on',
        'var_VGRD': 'on',
        'var_RH': 'on',
        'var_TMP': 'on',
        'var_DPT': 'on',
        'var_CAPE': 'on',
        'var_PRES': 'on',
        'lev_mean_sea_level': 'on',
        'lev_surface': 'on',
        'lev_1000_mb': 'on',
        'lev_975_mb': 'on',
        'lev_950_mb': 'on',
        'lev_900_mb': 'on',
        'lev_850_mb': 'on',
        'lev_500_mb': 'on',
        'lev_2_m_above_ground': 'on',
        'lev_10_m_above_ground': 'on',
    }

    if include_ts_fields:
        params.update({
            'var_ACPCP': 'on',
            'var_DZDT': 'on',
            'lev_600_mb': 'on',
            'lev_400_mb': 'on',
            'lev_300_mb': 'on',
            'lev_250_mb': 'on',
        })

    response = requests.get(
        'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl',
        params=params,
        timeout=240,
    )
    response.raise_for_status()

    if len(response.content) < 1000:
        raise RuntimeError(
            f'NOMADS returned an unexpectedly small payload for {grib_file}. '
            'The requested run/hour may not be available yet.'
        )

    with tempfile.NamedTemporaryFile(suffix='.grib2', delete=False) as temp_grib:
        temp_grib.write(response.content)
        temp_grib_path = temp_grib.name

    try:
        ds_msl = xr.open_dataset(
            temp_grib_path,
            engine='cfgrib',
            backend_kwargs={'filter_by_keys': {'typeOfLevel': 'meanSea'}, 'indexpath': ''},
        )
        ds_surface = xr.open_dataset(
            temp_grib_path,
            engine='cfgrib',
            backend_kwargs={'filter_by_keys': {'typeOfLevel': 'surface', 'stepType': 'instant'}, 'indexpath': ''},
        )
        ds_surface_accum = None
        if include_ts_fields and forecast_hour > 0:
            ds_surface_accum = xr.open_dataset(
                temp_grib_path,
                engine='cfgrib',
                backend_kwargs={'filter_by_keys': {'typeOfLevel': 'surface', 'stepType': 'accum'}, 'indexpath': ''},
            )
        ds_isobaric = xr.open_dataset(
            temp_grib_path,
            engine='cfgrib',
            backend_kwargs={'filter_by_keys': {'typeOfLevel': 'isobaricInhPa'}, 'indexpath': ''},
        )
        ds_2m = xr.open_dataset(
            temp_grib_path,
            engine='cfgrib',
            backend_kwargs={'filter_by_keys': {'typeOfLevel': 'heightAboveGround', 'level': 2}, 'indexpath': ''},
        )
        ds_10m = xr.open_dataset(
            temp_grib_path,
            engine='cfgrib',
            backend_kwargs={'filter_by_keys': {'typeOfLevel': 'heightAboveGround', 'level': 10}, 'indexpath': ''},
        )

        ds_msl = ds_msl.load()
        ds_surface = ds_surface.load()
        if ds_surface_accum is not None:
            ds_surface_accum = ds_surface_accum.load()
        ds_isobaric = ds_isobaric.load()
        ds_2m = ds_2m.load()
        ds_10m = ds_10m.load()

        # Avoid merge conflicts between 2m and 10m scalar height coordinates.
        ds_2m = ds_2m.drop_vars('heightAboveGround', errors='ignore')
        ds_10m = ds_10m.drop_vars('heightAboveGround', errors='ignore')

        # Convert isobaric level coordinate from hPa to Pa to match existing plotting code.
        isobaric_pa = (ds_isobaric['isobaricInhPa'] * 100).astype(np.int32)
        ds_isobaric = ds_isobaric.assign_coords(isobaricInhPa=isobaric_pa)
        ds_isobaric = ds_isobaric.rename({'isobaricInhPa': 'isobaric'})

        u10 = ds_10m['u10'].expand_dims({'height_above_ground2': [10]})
        v10 = ds_10m['v10'].expand_dims({'height_above_ground2': [10]})
        t2m = ds_2m['t2m'].expand_dims({'height_above_ground3': [2]})
        d2m = ds_2m['d2m'].expand_dims({'height_above_ground4': [2]})

        dataset_vars = {
            'MSLP_Eta_model_reduction_msl': ds_msl['prmsl'],
            'Geopotential_height_isobaric': ds_isobaric['gh'],
            'Geopotential_height_surface': ds_surface['orog'],
            'Precipitation_rate_surface': ds_surface['prate'],
            'u-component_of_wind_height_above_ground': u10,
            'v-component_of_wind_height_above_ground': v10,
            'Relative_humidity_isobaric': ds_isobaric['r'],
            'Temperature_isobaric': ds_isobaric['t'],
            'Temperature_height_above_ground': t2m,
            'Dewpoint_temperature_height_above_ground': d2m,
        }

        if 'cape' in ds_surface.data_vars:
            dataset_vars['Convective_available_potential_energy_surface'] = ds_surface['cape']
        if 'pres' in ds_surface.data_vars:
            dataset_vars['Pressure_surface'] = ds_surface['pres']

        if 'u' in ds_isobaric.data_vars:
            dataset_vars['u-component_of_wind_isobaric'] = ds_isobaric['u']
        if 'v' in ds_isobaric.data_vars:
            dataset_vars['v-component_of_wind_isobaric'] = ds_isobaric['v']

        if 'wz' in ds_isobaric.data_vars:
            dataset_vars['Geometric_vertical_velocity_isobaric'] = ds_isobaric['wz']

        if include_ts_fields:
            if forecast_hour == 0:
                acpcp_1h = np.zeros_like(ds_surface['prate'].values)
                current_acpcp_values = np.zeros_like(ds_surface['prate'].values)
            else:
                current_acpcp_values = ds_surface_accum['acpcp'].values
                if prev_acpcp_values is None:
                    prev_acpcp_values = get_gfs_convective_precip_accumulation(forecast_hour - 1, init_time)
                acpcp_1h = derive_incremental_accumulation(current_acpcp_values, prev_acpcp_values)

            dataset_vars['Convective_precipitation_1h_surface'] = (
                ('latitude', 'longitude'),
                acpcp_1h,
            )
        else:
            current_acpcp_values = None

        ds = xr.Dataset(
            dataset_vars
        )

        ds = ds.load()
        return ds, init_time, current_acpcp_values
    finally:
        safe_remove_file(temp_grib_path)


def get_latest_icon_run(target_time=None):
    base_url = 'https://opendata.dwd.de/weather/nwp/icon/grib'
    run_candidates = []

    for cycle in ['00', '06', '12', '18']:
        listing_url = f'{base_url}/{cycle}/pmsl/'
        response = requests.get(listing_url, timeout=60)
        if response.status_code != 200:
            continue

        files = re.findall(r'href="([^"]+_PMSL\.grib2\.bz2)"', response.text)
        if not files:
            continue

        run_match = re.search(r'_(\d{10})_\d{3}_PMSL\.grib2\.bz2$', files[0])
        if not run_match:
            continue

        run_stamp = run_match.group(1)
        run_dt = datetime.strptime(run_stamp, '%Y%m%d%H').replace(tzinfo=timezone.utc)
        run_candidates.append((run_dt, cycle, run_stamp))

    if not run_candidates:
        raise RuntimeError('No ICON runs found on DWD open data')

    if target_time is not None:
        matching = [item for item in run_candidates if item[0] == target_time]
        if matching:
            run_dt, cycle, run_stamp = matching[0]
        else:
            older_or_equal = [item for item in run_candidates if item[0] <= target_time]
            if older_or_equal:
                run_dt, cycle, run_stamp = max(older_or_equal, key=lambda item: item[0])
            else:
                run_dt, cycle, run_stamp = min(run_candidates, key=lambda item: item[0])
    else:
        run_dt, cycle, run_stamp = max(run_candidates, key=lambda item: item[0])

    return {
        'base_url': base_url,
        'cycle': cycle,
        'run_stamp': run_stamp,
        'init_time': run_dt,
    }


def _download_icon_grib2(icon_run, folder, filename):
    """Download and bz2-decompress one ICON GRIB2 file, using a local cache."""
    cache_path = os.path.join(ICON_CACHE_DIR, f"{icon_run['run_stamp']}_{folder}_{filename}")
    if os.path.exists(cache_path):
        with open(cache_path, 'rb') as fh:
            return fh.read()

    url = f"{icon_run['base_url']}/{icon_run['cycle']}/{folder}/{filename}"
    response = requests.get(url, timeout=240)
    response.raise_for_status()
    raw = bz2.decompress(response.content)

    os.makedirs(ICON_CACHE_DIR, exist_ok=True)
    with open(cache_path, 'wb') as fh:
        fh.write(raw)

    return raw


def _load_icon_field(icon_run, folder, filename):
    raw_grib = _download_icon_grib2(icon_run, folder, filename)
    with tempfile.NamedTemporaryFile(suffix='.grib2', delete=False) as temp_grib:
        temp_grib.write(raw_grib)
        temp_path = temp_grib.name

    try:
        ds = xr.open_dataset(temp_path, engine='cfgrib', backend_kwargs={'indexpath': ''})
        ds = ds.load()
    finally:
        safe_remove_file(temp_path)

    var_name = list(ds.data_vars)[0]
    return ds[var_name], ds


def _load_icon_static_remap(icon_run):
    clat_file = f"icon_global_icosahedral_time-invariant_{icon_run['run_stamp']}_CLAT.grib2.bz2"
    clon_file = f"icon_global_icosahedral_time-invariant_{icon_run['run_stamp']}_CLON.grib2.bz2"
    hsurf_file = f"icon_global_icosahedral_time-invariant_{icon_run['run_stamp']}_HSURF.grib2.bz2"

    clat_da, _ = _load_icon_field(icon_run, 'clat', clat_file)
    clon_da, _ = _load_icon_field(icon_run, 'clon', clon_file)
    hsurf_da, _ = _load_icon_field(icon_run, 'hsurf', hsurf_file)

    clat = clat_da.values
    clon = clon_da.values

    # ICON longitudes are in [-180, 180], convert to [0, 360) to match the plotting domain.
    clon_0360 = np.where(clon < 0, clon + 360.0, clon)

    domain_mask = (
        (clat >= lat_min - 1.0)
        & (clat <= lat_max + 1.0)
        & (clon_0360 >= lon_min - 1.0)
        & (clon_0360 <= lon_max + 1.0)
    )

    clat_sel = clat[domain_mask]
    clon_sel = clon_0360[domain_mask]
    hsurf_sel = hsurf_da.values[domain_mask]

    target_lons = np.arange(lon_min, lon_max + 0.0001, 0.25)
    target_lats = np.arange(lat_min, lat_max + 0.0001, 0.25)
    lon_grid, lat_grid = np.meshgrid(target_lons, target_lats)

    points = np.column_stack((clon_sel, clat_sel))
    tree = cKDTree(points)
    target_points = np.column_stack((lon_grid.ravel(), lat_grid.ravel()))
    _, nn_indices = tree.query(target_points)

    return {
        'mask': domain_mask,
        'lons': target_lons,
        'lats': target_lats,
        'lon_grid': lon_grid,
        'lat_grid': lat_grid,
        'nn_indices': nn_indices,
        'hsurf_grid': hsurf_sel[nn_indices].reshape(lat_grid.shape),
    }


def _regrid_icon_to_domain(icon_field_values, remap_state):
    values = icon_field_values[remap_state['mask']]
    return values[remap_state['nn_indices']].reshape(remap_state['lat_grid'].shape)


def get_icon_data(forecast_hour, icon_run, remap_state, prev_tp_values=None):
    """Fetch and regrid all ICON fields for one forecast hour.

    All per-field downloads and GRIB parses are dispatched in parallel via a
    thread pool.  Pass the raw TOT_PREC numpy array from the previous call as
    *prev_tp_values* to avoid re-downloading the prior hour's accumulation.

    Returns (ds, init_time, tp_raw_values) where tp_raw_values can be passed
    as prev_tp_values on the next consecutive forecast hour.
    """
    if forecast_hour < 0 or forecast_hour > 72:
        raise ValueError('ICON hourly generation is configured for forecast hours 0-72')

    run_stamp = icon_run['run_stamp']
    fh = f'{forecast_hour:03d}'
    pressure_levels_hpa = [1000, 950, 900, 850, 500]

    # Build the full list of (task_key, folder, filename) for this hour.
    fetch_tasks = [
        ('pmsl',    'pmsl',     f'icon_global_icosahedral_single-level_{run_stamp}_{fh}_PMSL.grib2.bz2'),
        ('u_10m',   'u_10m',    f'icon_global_icosahedral_single-level_{run_stamp}_{fh}_U_10M.grib2.bz2'),
        ('v_10m',   'v_10m',    f'icon_global_icosahedral_single-level_{run_stamp}_{fh}_V_10M.grib2.bz2'),
        ('t_2m',    't_2m',     f'icon_global_icosahedral_single-level_{run_stamp}_{fh}_T_2M.grib2.bz2'),
        ('td_2m',   'td_2m',    f'icon_global_icosahedral_single-level_{run_stamp}_{fh}_TD_2M.grib2.bz2'),
        ('tot_prec','tot_prec', f'icon_global_icosahedral_single-level_{run_stamp}_{fh}_TOT_PREC.grib2.bz2'),
    ]
    for level_hpa in pressure_levels_hpa:
        fetch_tasks.append((
            f'fi_{level_hpa}', 'fi',
            f'icon_global_icosahedral_pressure-level_{run_stamp}_{fh}_{level_hpa}_FI.grib2.bz2',
        ))
        fetch_tasks.append((
            f'rh_{level_hpa}', 'relhum',
            f'icon_global_icosahedral_pressure-level_{run_stamp}_{fh}_{level_hpa}_RELHUM.grib2.bz2',
        ))

    # Also fetch previous-hour TOT_PREC when it is not already available in memory.
    need_prev_tp = forecast_hour > 0 and prev_tp_values is None
    if need_prev_tp:
        prev_fh = f'{forecast_hour - 1:03d}'
        fetch_tasks.append((
            'tot_prec_prev', 'tot_prec',
            f'icon_global_icosahedral_single-level_{run_stamp}_{prev_fh}_TOT_PREC.grib2.bz2',
        ))

    def _fetch(task):
        key, folder, filename = task
        da, _ = _load_icon_field(icon_run, folder, filename)
        return key, da

    with ThreadPoolExecutor(max_workers=min(len(fetch_tasks), 8)) as pool:
        fetched = dict(pool.map(_fetch, fetch_tasks))

    pmsl_da  = fetched['pmsl']
    u10_da   = fetched['u_10m']
    v10_da   = fetched['v_10m']
    t2m_da   = fetched['t_2m']
    td2m_da  = fetched['td_2m']
    tp_da    = fetched['tot_prec']

    fi_levels = {level: fetched[f'fi_{level}']  for level in pressure_levels_hpa}
    rh_levels = {level: fetched[f'rh_{level}']  for level in pressure_levels_hpa}

    # Convert ICON accumulated precipitation to an hourly rate (mm/s).
    if forecast_hour == 0:
        tp_rate_raw = np.zeros_like(tp_da.values)
    elif prev_tp_values is not None:
        tp_rate_raw = np.maximum(tp_da.values - prev_tp_values, 0.0) / 3600.0
    else:
        tp_rate_raw = np.maximum(tp_da.values - fetched['tot_prec_prev'].values, 0.0) / 3600.0

    pmsl_grid = _regrid_icon_to_domain(pmsl_da.values, remap_state)
    u10_grid = _regrid_icon_to_domain(u10_da.values, remap_state)
    v10_grid = _regrid_icon_to_domain(v10_da.values, remap_state)
    t2m_grid = _regrid_icon_to_domain(t2m_da.values, remap_state)
    td2m_grid = _regrid_icon_to_domain(td2m_da.values, remap_state)
    tp_rate_grid = _regrid_icon_to_domain(tp_rate_raw, remap_state)

    fi_grids = {
        int(level * 100): _regrid_icon_to_domain(fi_levels[level].values / 9.80665, remap_state)
        for level in pressure_levels_hpa
    }
    rh_grids = {
        int(level * 100): _regrid_icon_to_domain(rh_levels[level].values, remap_state)
        for level in pressure_levels_hpa
    }

    isobaric_levels_pa = np.array(sorted(fi_grids.keys()), dtype=np.int32)
    geopotential_height = np.stack([fi_grids[level] for level in isobaric_levels_pa], axis=0)
    rel_humidity = np.stack([rh_grids[level] for level in isobaric_levels_pa], axis=0)

    ds = xr.Dataset(
        {
            'MSLP_Eta_model_reduction_msl': (('latitude', 'longitude'), pmsl_grid),
            'Geopotential_height_isobaric': (('isobaric', 'latitude', 'longitude'), geopotential_height),
            'Geopotential_height_surface': (('latitude', 'longitude'), remap_state['hsurf_grid']),
            'Precipitation_rate_surface': (('latitude', 'longitude'), tp_rate_grid),
            'u-component_of_wind_height_above_ground': (
                ('height_above_ground2', 'latitude', 'longitude'),
                u10_grid[np.newaxis, :, :],
            ),
            'v-component_of_wind_height_above_ground': (
                ('height_above_ground2', 'latitude', 'longitude'),
                v10_grid[np.newaxis, :, :],
            ),
            'Relative_humidity_isobaric': (('isobaric', 'latitude', 'longitude'), rel_humidity),
            'Temperature_height_above_ground': (
                ('height_above_ground3', 'latitude', 'longitude'),
                t2m_grid[np.newaxis, :, :],
            ),
            'Dewpoint_temperature_height_above_ground': (
                ('height_above_ground4', 'latitude', 'longitude'),
                td2m_grid[np.newaxis, :, :],
            ),
        },
        coords={
            'longitude': remap_state['lons'],
            'latitude': remap_state['lats'],
            'isobaric': isobaric_levels_pa,
            'height_above_ground2': [10],
            'height_above_ground3': [2],
            'height_above_ground4': [2],
        },
    )

    return ds, icon_run['init_time'], tp_da.values

# Function to plot the map
def plot_map(data, init_time, forecast_hour, model_name='GFS', layer_profile='bg'):
    fig = plt.figure(figsize=(12, 10))
    ax = fig.add_subplot(1, 1, 1, projection=ccrs.PlateCarree())

    ts_flash_profile = layer_profile == 'ts_flash'
    ts_severe_profile = layer_profile == 'ts_severe'
    bg_profile = layer_profile == 'bg'

    # Keep TS profile layering unchanged while restoring the requested BG stack.
    if bg_profile:
        z_coast = 9
        z_borders = 9
        z_gaf = 9
        z_mslp = 6
        z_thickness = 7
        z_low_cloud = 2
        z_fog = 3
        z_drizzle = 4
        z_bg_precip = 5
        z_bg_barbs = 8
        z_taf_points = 10
        z_taf_text = 11
    else:
        z_coast = 220
        z_borders = 220
        z_gaf = 221
        z_mslp = 5
        z_thickness = 6
        z_low_cloud = 2
        z_fog = 3
        z_drizzle = 4
        z_bg_precip = 7
        z_bg_barbs = 6
        z_taf_points = 100
        z_taf_text = 101
    
    # Load TAF data early for plotting later
    taf_lons = []
    taf_lats = []
    taf_names = []
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        taf_file = os.path.join(script_dir, 'geo files', 'TAF lat long.csv')
        taf_data = pd.read_csv(taf_file, delimiter='\t')
        for idx, row in taf_data.iterrows():
            lat = row['Latitude']
            lon = row['Longitude']
            # Only include TAF points within the domain bounds
            # Also account for label offset so text remains inside the domain.
            if (lat_min <= lat <= lat_max and lon_min <= lon <= lon_max and
                lon + TAF_LABEL_DX >= lon_min and lat + TAF_LABEL_DY <= lat_max):
                taf_names.append(row['TAF'])
                taf_lats.append(lat)
                taf_lons.append(lon)
        print(f"Loaded {len(taf_names)} TAF locations within domain")
    except Exception as e:
        print(f"Warning: Could not load TAF locations: {e}")
    
    # Add land/border boundaries on top of all weather layers.
    ax.add_feature(cfeature.COASTLINE, linewidth=0.8, zorder=z_coast)
    ax.add_feature(cfeature.BORDERS, linewidth=0.7, zorder=z_borders)
    
    # Add GAF boundaries from shapefile
    script_dir = os.path.dirname(os.path.abspath(__file__))
    gaf_shp = os.path.join(script_dir, 'geo files', 'GAF_Boundaries.shp')
    reader = Reader(gaf_shp)
    gaf_feature = ShapelyFeature(reader.geometries(), ccrs.PlateCarree(), 
                     facecolor='none', edgecolor='black', linewidth=0.7)
    ax.add_feature(gaf_feature, zorder=z_gaf)
    
    # Set extent
    ax.set_extent([lon_min, lon_max, lat_min, lat_max], crs=ccrs.PlateCarree())
    
    # Plot topography shading
    print("Plotting topography...")
    elevation, elev_lons, elev_lats = get_elevation_data(data)
    lon_grid, lat_grid = np.meshgrid(elev_lons, elev_lats)
    
    # Elevation levels and colors from XML
    elev_levels = [-1000, -15, 0, 50, 75, 150, 250, 350, 500, 1000, 1500, 2000, 2200]
    elev_colors = [
        (234/255.0, 244/255.0, 255/255.0),  # -1000 - ocean blue (#eaf4ff)
        (234/255.0, 244/255.0, 255/255.0),  # -15 - ocean blue (#eaf4ff)
        (230/255.0, 230/255.0, 190/255.0),  # 0 - intermediate tan (#e6e6be)
        (230/255.0, 230/255.0, 190/255.0),  # 50 - intermediate tan (#e6e6be)
        (230/255.0, 230/255.0, 190/255.0),  # 75 - intermediate tan (#e6e6be)
        (210/255.0, 210/255.0, 157/255.0),  # 150 - tan (#d2d29d)
        (170/255.0, 170/255.0, 127/255.0),  # 250 - darker tan
        (255/255.0, 255/255.0, 0/255.0),    # 350 - yellow
        (255/255.0, 102/255.0, 0/255.0),    # 500 - orange
        (153/255.0, 51/255.0, 0/255.0),     # 1000 - dark brown
        (0/255.0, 204/255.0, 255/255.0),    # 1500 - cyan
        (192/255.0, 192/255.0, 192/255.0),  # 2000 - gray
        (255/255.0, 255/255.0, 255/255.0)   # 2200+ - white
    ]
    
    elev_cmap = ListedColormap(elev_colors)
    elev_norm = BoundaryNorm(elev_levels, elev_cmap.N, clip=True)
    
    # Create mask for ocean areas using Natural Earth land feature
    print("Creating ocean mask from Natural Earth land data...")
    
    # Load Natural Earth 10m land shapefile to identify land areas  
    land_shp = natural_earth(resolution='10m', category='physical', name='land')
    land_reader = Reader(land_shp)
    land_geoms = list(land_reader.geometries())
    
    # Merge all land geometries and create prepared geometry for fast contains tests
    land_union = unary_union(land_geoms)
    land_prep = prep(land_union)
    
    # Create boolean mask for ocean points (inverse of land)
    ocean_mask = np.zeros_like(elevation, dtype=bool)
    
    # Check each grid point - use prepared geometry for 10x speedup
    for i in range(elevation.shape[0]):  # Iterate over first dimension
        for j in range(elevation.shape[1]):  # Iterate over second dimension
            lon = lon_grid[i, j]
            lat = lat_grid[i, j]
            point = Point(lon, lat)
            
            # If point is NOT within land geometry, it's ocean
            if not land_prep.contains(point):
                ocean_mask[i, j] = True
    
    print(f"Identified {np.sum(ocean_mask)} ocean grid points out of {elevation.size} total")
    
    # Create a modified elevation array where ocean areas are set to -1000
    elev_masked = elevation.copy()
    elev_masked[ocean_mask] = -1000
    
    cs_topo = ax.contourf(
        lon_grid,
        lat_grid,
        elev_masked,
        levels=elev_levels,
        cmap=elev_cmap,
        norm=elev_norm,
        alpha=0.3,
        extend='both',
        transform=ccrs.PlateCarree(),
        zorder=0)
    
    # Plot MSLP
    mslp = get_time_index(data['MSLP_Eta_model_reduction_msl']) / 100  # Convert to hPa
    cs_mslp = ax.contour(
        data.longitude,
        data.latitude,
        mslp,
        levels=np.arange(980, 1040, 4),
        colors='black',
        linewidths=1,
        alpha=0.3,
        zorder=z_mslp,
    )
    mslp_labels = ax.clabel(cs_mslp, inline=True, fontsize=8)
    for label in mslp_labels:
        label.set_alpha(0.3)

    if ts_severe_profile:
        # Plot 250 hPa isotachs for severe storm potential context.
        u_250 = get_isobaric_field(data['u-component_of_wind_isobaric'], 25000)
        v_250 = get_isobaric_field(data['v-component_of_wind_isobaric'], 25000)
        wind_250_kt = np.sqrt(u_250.values**2 + v_250.values**2) * 1.94384
        isotach_masked = np.where(wind_250_kt >= 80.0, wind_250_kt, np.nan)

        isotach_levels = [80, 100, 120, 140, 160, 180, 300]
        isotach_colors = ['#000080', '#ffff00', '#ff6600', '#ff0000', '#800000', '#ff00ff']
        isotach_cmap = ListedColormap(isotach_colors)
        isotach_norm = BoundaryNorm(isotach_levels, isotach_cmap.N, clip=False)

        ax.contourf(
            data.longitude,
            data.latitude,
            isotach_masked,
            levels=isotach_levels,
            cmap=isotach_cmap,
            norm=isotach_norm,
            alpha=0.5,
            extend='max',
            transform=ccrs.PlateCarree(),
            zorder=6,
        )
    
    if layer_profile == 'bg':
        # Plot thickness (1000-500 hPa)
        hgt_1000 = get_isobaric_field(data['Geopotential_height_isobaric'], 100000) / 10  # Convert to dam
        hgt_500 = get_isobaric_field(data['Geopotential_height_isobaric'], 50000) / 10
        thickness = hgt_500 - hgt_1000

        # Define major and minor levels
        major_levels = np.arange(480, 602, 18)
        all_minor_levels = np.arange(480, 602, 6)

        # Plot only minor lines that are NOT major lines
        major_levels_set = set(major_levels)
        minor_only_levels = np.array([x for x in all_minor_levels if x not in major_levels_set])

        cs_thickness_minor = ax.contour(data.longitude, data.latitude, thickness, levels=minor_only_levels,
                         colors='red', linewidths=1, linestyles='dashed', alpha=0.3, zorder=z_thickness)

        # Plot major interval lines (spacing of 18, blue)
        cs_thickness_major = ax.contour(data.longitude, data.latitude, thickness, levels=major_levels,
                         colors='blue', linewidths=1, linestyles='dashed', alpha=0.3, zorder=z_thickness)
        ax.clabel(cs_thickness_major, inline=True, fontsize=8, fmt='%d')

        # Plot low cloud layer (maxRH at 1000, 975, 950 hPa)
        rh_1000 = get_isobaric_field(data['Relative_humidity_isobaric'], 100000)
        rh_975 = get_isobaric_field(data['Relative_humidity_isobaric'], 97500)
        rh_950 = get_isobaric_field(data['Relative_humidity_isobaric'], 95000)

        # Calculate maximum RH across the three levels
        max_rh = np.maximum(np.maximum(rh_1000.values, rh_975.values), rh_950.values)

        # Create custom colormap for low clouds
        cloud_colors = ['#ffffff', '#c86400', '#aa5500', '#6d3600']
        cloud_levels = [85, 90, 95, 97.5, 100]
        cloud_cmap = ListedColormap(cloud_colors)
        cloud_norm = BoundaryNorm(cloud_levels, cloud_cmap.N, clip=True)

        cs_cloud = ax.contourf(
            data.longitude,
            data.latitude,
            max_rh,
            levels=cloud_levels,
            cmap=cloud_cmap,
            norm=cloud_norm,
            alpha=0.7,
            extend='max',
            transform=ccrs.PlateCarree(),
            zorder=z_low_cloud)

        # Plot drizzle layer (average RH at 950, 900, 850 hPa)
        rh_950_drizzle = get_isobaric_field(data['Relative_humidity_isobaric'], 95000)
        rh_900 = get_isobaric_field(data['Relative_humidity_isobaric'], 90000)
        rh_850 = get_isobaric_field(data['Relative_humidity_isobaric'], 85000)

        # Calculate average RH across the three levels
        avg_rh_drizzle = (rh_950_drizzle.values + rh_900.values + rh_850.values) / 3.0

        # Mask out values below 92.5%
        drizzle_masked = np.where(avg_rh_drizzle >= 92.5, avg_rh_drizzle, np.nan)

        # Create colormap for drizzle (green only where RH >= 95%)
        drizzle_levels = [92.5, 95, 100]
        drizzle_colors = [(1.0, 1.0, 1.0, 0.0), (0.0, 1.0, 0.0, 1.0)]  # Transparent white, opaque green
        drizzle_cmap = ListedColormap(drizzle_colors)
        drizzle_norm = BoundaryNorm(drizzle_levels, drizzle_cmap.N, clip=True)

        cs_drizzle = ax.contourf(
            data.longitude,
            data.latitude,
            drizzle_masked,
            levels=drizzle_levels,
            cmap=drizzle_cmap,
            norm=drizzle_norm,
            alpha=1.0,
            extend='max',
            transform=ccrs.PlateCarree(),
            zorder=z_drizzle)
    
    # Calculate 10 m surface wind once for both fog logic and wind barbs
    u_wind = get_time_index(data['u-component_of_wind_height_above_ground'].sel(height_above_ground2=10))
    v_wind = get_time_index(data['v-component_of_wind_height_above_ground'].sel(height_above_ground2=10))

    shear_u_ms = None
    shear_v_ms = None
    if ts_severe_profile:
        u_500 = get_isobaric_field(data['u-component_of_wind_isobaric'], 50000)
        v_500 = get_isobaric_field(data['v-component_of_wind_isobaric'], 50000)
        shear_u_ms = u_500.values - u_wind.values
        shear_v_ms = v_500.values - v_wind.values
        shear_mag_ms = np.sqrt(shear_u_ms**2 + shear_v_ms**2)

        if 'Convective_available_potential_energy_surface' in data:
            sbcape = get_time_index(data['Convective_available_potential_energy_surface'])
        else:
            print('Warning: CAPE field missing; using zeros for SigHail')
            sbcape = xr.zeros_like(u_wind)

        if 'Pressure_surface' in data:
            surface_pressure_hpa = get_time_index(data['Pressure_surface']) / 100.0
        else:
            print('Warning: Surface pressure missing; using MSLP proxy for SigHail mixing ratio')
            surface_pressure_hpa = get_time_index(data['MSLP_Eta_model_reduction_msl']) / 100.0
        td2m_c = get_time_index(data['Dewpoint_temperature_height_above_ground'].sel(height_above_ground4=2)) - 273.15
        mixing_ratio = mixing_ratio_from_dewpoint_and_pressure(td2m_c.values, surface_pressure_hpa.values)

        t700_c = get_isobaric_field(data['Temperature_isobaric'], 70000).values - 273.15
        t500_c = get_isobaric_field(data['Temperature_isobaric'], 50000).values - 273.15
        z700_km = get_isobaric_field(data['Geopotential_height_isobaric'], 70000).values / 1000.0
        z500_km = get_isobaric_field(data['Geopotential_height_isobaric'], 50000).values / 1000.0

        layer_dz_km = z700_km - z500_km
        layer_dz_km = np.where(np.abs(layer_dz_km) < 1e-6, np.nan, layer_dz_km)

        sighail = (
            sbcape.values
            * mixing_ratio
            * 1000.0
            * ((t700_c - t500_c) / layer_dz_km)
            * t500_c
            * shear_mag_ms
        ) / 44000000.0

        sighail_levels = [
            0.0, 0.1, 0.2, 0.3, 0.4, 0.5,
            0.6, 0.7, 0.8, 0.9, 1.0, 1.1,
            1.2, 1.3, 1.4, 1.5, 1.6, 1.7,
            1.8, 1.9, 2.0, 2.2, 2.4, 2.6,
            2.8, 3.0, 3.5, 4.0, 5.0,
        ]
        sighail_interval_colors = [
            (255, 255, 255, 0),
            (97, 0, 97, 120),
            (119, 0, 135, 120),
            (128, 0, 206, 120),
            (0, 127, 254, 120),
            (0, 168, 254, 120),
            (0, 208, 254, 120),
            (0, 245, 254, 120),
            (0, 254, 179, 120),
            (0, 254, 70, 120),
            (104, 254, 0, 120),
            (165, 254, 0, 120),
            (193, 254, 0, 120),
            (221, 254, 0, 120),
            (248, 254, 0, 120),
            (254, 231, 0, 120),
            (254, 202, 0, 120),
            (254, 171, 0, 120),
            (254, 140, 0, 120),
            (254, 107, 0, 120),
            (254, 70, 0, 120),
            (254, 0, 0, 120),
            (254, 77, 77, 120),
            (254, 109, 109, 120),
            (254, 132, 132, 120),
            (254, 171, 171, 120),
            (254, 210, 210, 120),
            (254, 223, 223, 120),
        ]
        sighail_over_color = (254, 254, 254, 120)
        sighail_colors_norm = [
            (r / 255.0, g / 255.0, b / 255.0, a / 255.0)
            for r, g, b, a in sighail_interval_colors
        ]
        sighail_cmap = ListedColormap(sighail_colors_norm)
        sighail_cmap.set_over(tuple(channel / 255.0 for channel in sighail_over_color))
        sighail_norm = BoundaryNorm(sighail_levels, sighail_cmap.N, clip=False)

        ax.contourf(
            data.longitude,
            data.latitude,
            sighail,
            levels=sighail_levels,
            cmap=sighail_cmap,
            norm=sighail_norm,
            extend='max',
            transform=ccrs.PlateCarree(),
            zorder=6.1,
        )
    
    if layer_profile == 'bg':
        # Plot fog layer using 2 m temperature/dewpoint spread and light surface winds
        temp_2m = get_time_index(data['Temperature_height_above_ground'].sel(height_above_ground3=2)) - 273.15
        dewpoint_2m = get_time_index(data['Dewpoint_temperature_height_above_ground'].sel(height_above_ground4=2)) - 273.15
        wind_speed_kt = np.sqrt(u_wind.values**2 + v_wind.values**2) * 1.94384  # m/s to kt
        temp_dew_spread = temp_2m.values - dewpoint_2m.values

        fog = np.zeros_like(temp_dew_spread, dtype=int)
        fog[(wind_speed_kt < 5) & (temp_dew_spread < 1.0)] = 1
        fog[(wind_speed_kt < 3) & (temp_dew_spread < 0.5)] = 2
        fog[(wind_speed_kt < 1) & (temp_dew_spread < 0.1)] = 3

        print(f"Fog grid points - F1: {np.sum(fog == 1)}, F2: {np.sum(fog == 2)}, F3: {np.sum(fog == 3)}")

        fog_masked = np.ma.masked_where(fog == 0, fog)
        fog_cmap = ListedColormap(['#ff0000', '#ffaa7f', '#ffff00'])
        fog_levels = [0.5, 1.5, 2.5, 3.5]
        fog_norm = BoundaryNorm(fog_levels, fog_cmap.N, clip=True)

        cs_fog = ax.contourf(
            data.longitude,
            data.latitude,
            fog_masked,
            levels=fog_levels,
            cmap=fog_cmap,
            norm=fog_norm,
            alpha=1.0,
            transform=ccrs.PlateCarree(),
            zorder=z_fog)
    
    # Plot 1hr precipitation / TS flash density field
    if ts_flash_profile:
        base_precip = get_time_index(data['Precipitation_rate_surface']) * 3600  # Convert to mm/hr
        base_precip_masked = base_precip.where(base_precip >= 0.1, np.nan)
        base_precip_levels = [0, 0.1, 0.2, 0.5, 1, 2, 5, 7.5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
        base_precip_colors = [
            (255, 255, 255, 255),
            (240, 255, 150, 255),
            (240, 255, 60, 255),
            (255, 255, 0, 255),
            (200, 255, 0, 255),
            (150, 255, 0, 255),
            (0, 150, 0, 255),
            (0, 175, 128, 255),
            (0, 200, 255, 255),
            (0, 150, 255, 255),
            (0, 0, 255, 255),
            (0, 0, 255, 255),
            (255, 100, 0, 255),
            (255, 50, 0, 255),
            (255, 0, 0, 255),
            (200, 0, 0, 255),
            (50, 0, 0, 255),
        ]
        base_precip_colors_norm = [(r / 255.0, g / 255.0, b / 255.0, a / 255.0) for r, g, b, a in base_precip_colors]
        base_precip_cmap = ListedColormap(base_precip_colors_norm)
        base_precip_norm = BoundaryNorm(base_precip_levels, base_precip_cmap.N, clip=True)

        ax.contourf(
            data.longitude,
            data.latitude,
            base_precip_masked,
            levels=base_precip_levels,
            cmap=base_precip_cmap,
            norm=base_precip_norm,
            alpha=0.3,
            extend='max',
            transform=ccrs.PlateCarree(),
            zorder=7)

        total_totals = calculate_total_totals(data)
        max_wz = get_max_geometric_vertical_velocity(data, [60000, 50000, 40000, 30000, 25000])
        convective_precip = data['Convective_precipitation_1h_surface']
        ts_mask = (total_totals > 45.0) & (max_wz > 0.1)

        print(f'Total Totals > 45 grid points: {np.sum(total_totals > 45.0)}')
        print(f'Max geometric vertical velocity > 0.1 m/s grid points: {np.sum(max_wz > 0.1)}')
        print(f'Combined TS mask grid points: {np.sum(ts_mask)}')

        precip_masked = np.where(ts_mask & (convective_precip.values >= 0.1), convective_precip.values, np.nan)
        precip_levels = [0, 0.1, 0.3, 0.5, 1.0, 2.5, 5.0, 7.5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 100, 300]
        precip_colors = [
            (255, 255, 255, 0),      # 0-0.1mm (transparent)
            (0, 255, 0, 255),        # 0.1-0.3mm (#00FF00)
            (128, 255, 0, 255),      # 0.3-0.5mm (#80FF00)
            (255, 251, 0, 255),      # 0.5-1.0mm (#FFFB00)
            (255, 240, 0, 255),      # 1.0-2.5mm (#FFF000)
            (255, 218, 0, 255),      # 2.5-5.0mm (#FFDA00)
            (255, 153, 0, 255),      # 5.0-7.5mm (#FF9900)
            (255, 115, 0, 255),      # 7.5-10mm (#FF7300)
            (255, 76, 0, 255),       # 10-15mm (#FF4C00)
            (255, 0, 0, 255),        # 15-20mm (#FF0000)
            (255, 32, 110, 255),     # 20-25mm (existing palette)
            (255, 32, 121, 255),     # 25-30mm (existing palette)
            (255, 34, 159, 255),     # 30-35mm (existing palette)
            (255, 30, 184, 255),     # 35-40mm (existing palette)
            (255, 32, 214, 255),     # 40-45mm (existing palette)
            (236, 32, 255, 255),     # 45-50mm (existing palette)
            (192, 32, 255, 255),     # 50-55mm (existing palette)
            (144, 33, 255, 255),     # 55-60mm (existing palette)
            (101, 29, 255, 255),     # 60-100mm (existing palette)
            (28, 20, 255, 255),      # 100-300mm (existing palette)
            (14, 255, 235, 255),     # 300+mm (existing palette)
        ]
        precip_alpha = 1.0
        precip_zorder = 8
    elif ts_severe_profile:
        precip_masked = None
        precip_levels = None
        precip_colors = None
        precip_alpha = None
        precip_zorder = None
    else:
        precip = get_time_index(data['Precipitation_rate_surface']) * 3600  # Convert to mm/hr
        precip_masked = precip.where(precip >= 0.1, np.nan)
        precip_levels = [0, 0.1, 0.2, 0.5, 1, 2, 5, 7.5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
        precip_colors = [
            (255, 255, 255, 255),
            (240, 255, 150, 255),
            (240, 255, 60, 255),
            (255, 255, 0, 255),
            (200, 255, 0, 255),
            (150, 255, 0, 255),
            (0, 150, 0, 255),
            (0, 175, 128, 255),
            (0, 200, 255, 255),
            (0, 150, 255, 255),
            (0, 0, 255, 255),
            (0, 0, 255, 255),
            (255, 100, 0, 255),
            (255, 50, 0, 255),
            (255, 0, 0, 255),
            (200, 0, 0, 255),
            (50, 0, 0, 255),
        ]
        precip_alpha = 1.0
        precip_zorder = z_bg_precip

    if not ts_severe_profile:
        precip_colors_norm = [(r / 255.0, g / 255.0, b / 255.0, a / 255.0) for r, g, b, a in precip_colors]
        precip_cmap = ListedColormap(precip_colors_norm)
        precip_norm = BoundaryNorm(precip_levels, precip_cmap.N, clip=True)

        cs_precip = ax.contourf(
            data.longitude,
            data.latitude,
            precip_masked,
            levels=precip_levels,
            cmap=precip_cmap,
            norm=precip_norm,
            alpha=precip_alpha,
            extend='max',
            transform=ccrs.PlateCarree(),
            zorder=precip_zorder)

    if ts_flash_profile:
        # Add subtle dotted bin outlines to separate TS increments from background layers.
        outline_levels = precip_levels[1:-1]
        ax.contour(
            data.longitude,
            data.latitude,
            precip_masked,
            levels=outline_levels,
            colors=[(0.08, 0.08, 0.08, 1.0)],
            linewidths=0.35,
            linestyles='dashed',
            transform=ccrs.PlateCarree(),
            zorder=precip_zorder + 0.1,
        )

        # Draw the outer patch boundary so dashed lines appear on the edge of colored TS areas too.
        patch_mask = np.isfinite(precip_masked).astype(float)
        ax.contour(
            data.longitude,
            data.latitude,
            patch_mask,
            levels=[0.5],
            colors=[(0.08, 0.08, 0.08, 1.0)],
            linewidths=0.35,
            linestyles='dashed',
            transform=ccrs.PlateCarree(),
            zorder=precip_zorder + 0.15,
        )
    
    # Plot SFC winds unless explicitly disabled for severe-potential profile.
    if not ts_severe_profile:
        ax.barbs(data.longitude[::10], data.latitude[::10], u_wind.values[::10, ::10], v_wind.values[::10, ::10], 
                 length=5, linewidth=0.5, color='#800000', alpha=0.3, zorder=(z_bg_barbs if bg_profile else 6))
    else:
        # Plot surface-to-500 hPa shear vectors as barbs in kt.
        shear_u_kt = shear_u_ms * 1.94384
        shear_v_kt = shear_v_ms * 1.94384

        ax.barbs(
            data.longitude[::10],
            data.latitude[::10],
            shear_u_kt[::10, ::10],
            shear_v_kt[::10, ::10],
            length=5,
            linewidth=0.5,
            color='#2b0000',
            alpha=0.5,
            zorder=6.2,
        )
    
    # Plot TAF locations with filtering based on text bounding boxes
    if taf_lons:  # Only plot if TAF data was loaded successfully
        # Plot tiny dots to mark TAF locations
        ax.scatter(taf_lons, taf_lats, s=2, c='black', marker='o', zorder=z_taf_points, transform=ccrs.PlateCarree())
        
        # Track which points to keep
        points_to_keep = []
        
        # Create text objects for all TAF names
        text_objects = []
        for idx, (lon, lat, name) in enumerate(zip(taf_lons, taf_lats, taf_names)):
            text_obj = ax.text(lon + TAF_LABEL_DX, lat + TAF_LABEL_DY, name, fontsize=5, ha='right', va='bottom', 
                              zorder=z_taf_text, transform=ccrs.PlateCarree())
            text_objects.append((text_obj, lon, lat, name, idx))
        
        # Draw canvas to compute text extents
        fig.canvas.draw()
        
        # Check which text objects have bounding boxes completely within domain
        for text_obj, lon, lat, name, idx in text_objects:
            # Get text bounding box in display coordinates
            bbox_display = text_obj.get_window_extent(renderer=fig.canvas.get_renderer())
            
            # Transform bounding box corners to data coordinates
            # Get the transform from display to data coordinates
            trans_display_to_data = ax.transData.inverted()
            bbox_data = bbox_display.transformed(trans_display_to_data)
            
            # Check if all corners of bounding box are within domain bounds
            x_min, y_min = bbox_data.xmin, bbox_data.ymin
            x_max, y_max = bbox_data.xmax, bbox_data.ymax
            
            # If any corner is outside domain, remove the text
            if not (lon_min <= x_min and x_max <= lon_max and 
                    lat_min <= y_min and y_max <= lat_max):
                text_obj.remove()
                print(f"Removing {name}: bbox outside domain (lon: {x_min:.2f}-{x_max:.2f}, lat: {y_min:.2f}-{y_max:.2f})")
            else:
                points_to_keep.append(idx)
        
        print(f"Removed {len(text_objects) - len(points_to_keep)} TAF points with labels outside domain")

    # Add day/night terminator and night shading above all other layers
    valid_time = init_time + timedelta(hours=forecast_hour)
    cos_zenith, night_mask = get_day_night_grid(valid_time, data.longitude.values, data.latitude.values)
    print(f"Night grid points: {np.sum(night_mask)} out of {night_mask.size}")

    night_overlay = np.where(night_mask, 1.0, np.nan)
    ax.contourf(
        data.longitude,
        data.latitude,
        night_overlay,
        levels=[0.5, 1.5],
        colors=[(0.5, 0.5, 0.5, 0.3)],
        transform=ccrs.PlateCarree(),
        zorder=200,
    )
    
    # Add title
    title = (
        f'{model_name} Forecast\n'
        f'Run: {init_time.strftime("%Y-%m-%d %H%MZ")} | Valid: '
        f'{valid_time.strftime("%Y-%m-%d %H%MZ")}'
    )
    ax.set_title(title)
    
    return fig

def generate_gfs_bg_frames(forecast_hours):
    output_dir = 'images/BG/US'
    os.makedirs(output_dir, exist_ok=True)
    latest_dataset, init_time = get_latest_gfs_dataset()

    # Generate the full new run in a temporary OS directory so the published folder stays stable
    with tempfile.TemporaryDirectory(prefix='avmaps_bg_us_') as temp_dir:
        print(f'Generating {len(forecast_hours)} forecast frames in temporary workspace: {temp_dir}')
        generated_files = []

        for forecast_hour in forecast_hours:
            print(f'\nGenerating frame +{forecast_hour}hrs...')

            # Get raw hourly data from NOMADS GFS 0.25 files.
            data, init_time, _ = get_gfs_data(forecast_hour, latest_dataset, init_time)
            print('Using raw hourly GFS 0.25 model fields')

            # Plot map
            fig = plot_map(data, init_time, forecast_hour, model_name='GFS')

            filename = f'GFS_{init_time.strftime("%Y%m%d_%H")}_{forecast_hour:02d}.png'
            temp_filepath = os.path.join(temp_dir, filename)
            fig.savefig(temp_filepath, dpi=150, bbox_inches='tight')
            plt.close(fig)
            generated_files.append(filename)

            print(f'Map staged at {temp_filepath}')

        print(f'\nFinished building {len(generated_files)} frames. Publishing to {output_dir}...')
        publish_generated_frames(output_dir, generated_files, temp_dir)


def generate_gfs_ts_flash_frames(forecast_hours):
    output_dir = 'images/TS/Flash density'
    os.makedirs(output_dir, exist_ok=True)
    latest_dataset, init_time = get_latest_gfs_dataset()

    with tempfile.TemporaryDirectory(prefix='avmaps_ts_flash_') as temp_dir:
        print(f'Generating {len(forecast_hours)} TS flash-density frames in temporary workspace: {temp_dir}')
        generated_files = []
        prev_acpcp_values = None
        last_generated_hour = None

        for forecast_hour in forecast_hours:
            print(f'\nGenerating TS flash-density frame +{forecast_hour}hrs...')

            use_prev = prev_acpcp_values is not None and last_generated_hour == forecast_hour - 1
            data, init_time, prev_acpcp_values = get_gfs_data(
                forecast_hour,
                latest_dataset,
                init_time,
                include_ts_fields=True,
                prev_acpcp_values=(prev_acpcp_values if use_prev else None),
            )
            last_generated_hour = forecast_hour
            print('Using raw hourly GFS convective precipitation, Total Totals, and geometric vertical velocity fields')

            fig = plot_map(data, init_time, forecast_hour, model_name='GFS', layer_profile='ts_flash')

            filename = f'GFS_{init_time.strftime("%Y%m%d_%H")}_{forecast_hour:02d}.png'
            temp_filepath = os.path.join(temp_dir, filename)
            fig.savefig(temp_filepath, dpi=150, bbox_inches='tight')
            plt.close(fig)
            generated_files.append(filename)

            print(f'TS flash-density map staged at {temp_filepath}')

        print(f'\nFinished building {len(generated_files)} TS flash-density frames. Publishing to {output_dir}...')
        publish_generated_frames(output_dir, generated_files, temp_dir)


def generate_gfs_ts_severe_frames(forecast_hours):
    output_dir = 'images/TS/Severe storm potential'
    os.makedirs(output_dir, exist_ok=True)
    latest_dataset, init_time = get_latest_gfs_dataset()

    with tempfile.TemporaryDirectory(prefix='avmaps_ts_severe_') as temp_dir:
        print(f'Generating {len(forecast_hours)} TS severe-potential frames in temporary workspace: {temp_dir}')
        generated_files = []
        prev_acpcp_values = None
        last_generated_hour = None

        for forecast_hour in forecast_hours:
            print(f'\nGenerating TS severe-potential frame +{forecast_hour}hrs...')

            use_prev = prev_acpcp_values is not None and last_generated_hour == forecast_hour - 1
            data, init_time, prev_acpcp_values = get_gfs_data(
                forecast_hour,
                latest_dataset,
                init_time,
                include_ts_fields=True,
                prev_acpcp_values=(prev_acpcp_values if use_prev else None),
            )
            last_generated_hour = forecast_hour
            print('Using raw hourly GFS convective precipitation, Total Totals, and geometric vertical velocity fields')

            fig = plot_map(data, init_time, forecast_hour, model_name='GFS', layer_profile='ts_severe')

            filename = f'GFS_{init_time.strftime("%Y%m%d_%H")}_{forecast_hour:02d}.png'
            temp_filepath = os.path.join(temp_dir, filename)
            fig.savefig(temp_filepath, dpi=150, bbox_inches='tight')
            plt.close(fig)
            generated_files.append(filename)

            print(f'TS severe-potential map staged at {temp_filepath}')

        print(f'\nFinished building {len(generated_files)} TS severe-potential frames. Publishing to {output_dir}...')
        publish_generated_frames(output_dir, generated_files, temp_dir)


def generate_icon_bg_frames(forecast_hours, preferred_run_time=None):
    output_dir = 'images/BG/ICON'
    os.makedirs(output_dir, exist_ok=True)

    icon_run = get_latest_icon_run(target_time=preferred_run_time)
    init_time = icon_run['init_time']
    remap_state = _load_icon_static_remap(icon_run)

    with tempfile.TemporaryDirectory(prefix='avmaps_bg_icon_') as temp_dir:
        print(f'Generating {len(forecast_hours)} ICON forecast frames in temporary workspace: {temp_dir}')
        generated_files = []

        prev_tp_values = None
        last_generated_hour = None
        for forecast_hour in forecast_hours:
            print(f'\nGenerating ICON frame +{forecast_hour}hrs...')

            # Pass the in-memory TOT_PREC from the previous iteration to avoid
            # a redundant network fetch (or cache read) for the prior hour.
            use_prev = (prev_tp_values is not None
                        and last_generated_hour == forecast_hour - 1)
            data, init_time, prev_tp_values = get_icon_data(
                forecast_hour, icon_run, remap_state,
                prev_tp_values=(prev_tp_values if use_prev else None),
            )
            last_generated_hour = forecast_hour
            print('Using raw hourly ICON model fields')

            fig = plot_map(data, init_time, forecast_hour, model_name='ICON')

            filename = f'ICON_{init_time.strftime("%Y%m%d_%H")}_{forecast_hour:02d}.png'
            temp_filepath = os.path.join(temp_dir, filename)
            fig.savefig(temp_filepath, dpi=150, bbox_inches='tight')
            plt.close(fig)
            generated_files.append(filename)

            print(f'ICON map staged at {temp_filepath}')

        print(f'\nFinished building {len(generated_files)} ICON frames. Publishing to {output_dir}...')
        publish_generated_frames(output_dir, generated_files, temp_dir)


# Main function
def main():
    parser = argparse.ArgumentParser(description='Generate BG forecast frames from GFS and/or ICON data.')
    parser.add_argument('--model', choices=['gfs', 'icon', 'both'], default='both')
    parser.add_argument('--layer', choices=['bg', 'ts_flash', 'ts_severe'], default='bg')
    parser.add_argument('--start-hour', type=int, default=9)
    parser.add_argument('--end-hour', type=int, default=35)
    args = parser.parse_args()

    forecast_hours = list(range(args.start_hour, args.end_hour + 1))

    if args.layer == 'ts_flash':
        if args.model != 'gfs':
            raise ValueError('The ts_flash layer is currently supported for GFS only')
        generate_gfs_ts_flash_frames(forecast_hours)
        return

    if args.layer == 'ts_severe':
        if args.model != 'gfs':
            raise ValueError('The ts_severe layer is currently supported for GFS only')
        generate_gfs_ts_severe_frames(forecast_hours)
        return

    gfs_run_time = None
    if args.model in ('gfs', 'both'):
        _, gfs_run_time = get_latest_gfs_dataset()
        generate_gfs_bg_frames(forecast_hours)

    if args.model in ('icon', 'both'):
        preferred_time = gfs_run_time if args.model == 'both' else None
        generate_icon_bg_frames(forecast_hours, preferred_run_time=preferred_time)

if __name__ == '__main__':
    main()