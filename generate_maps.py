import matplotlib.pyplot as plt
from matplotlib.colors import BoundaryNorm, ListedColormap
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from cartopy.io.shapereader import Reader, natural_earth
from cartopy.feature import ShapelyFeature
from shapely.geometry import Point
from shapely.prepared import prep
from shapely.ops import unary_union
from siphon.catalog import TDSCatalog
from siphon.ncss import NCSS
import xarray as xr
import metpy.calc as mpcalc
from metpy.units import units
import numpy as np
from datetime import datetime, timedelta, timezone
import os
import pandas as pd
import pandas as pd

# Define the Australia domain
# SW corner: 47°57'S, 103°34'E
# NE corner: 22°33'S, 172°7'E
lat_min = -47.95  # 47°57'S
lat_max = -22.55  # 22°33'S
lon_min = 103.5667  # 103°34'E
lon_max = 172.1167  # 172°7'E

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

# Function to get elevation data from GFS surface geopotential
def get_elevation_data(data=None):
    """Extract elevation from GFS surface geopotential height or use remote sources"""
    
    # Try to extract from GFS data first
    if data is not None:
        try:
            print("Extracting elevation from GFS surface geopotential...")
    # Get surface geopotential height
            geop_surface = get_time_index(data['Geopotential_height_surface'])
            
            print(f"Raw geopotential min/max: {geop_surface.values.min():.0f} / {geop_surface.values.max():.0f}")
            print(f"Variable units: {geop_surface.attrs.get('units', 'unknown')}")
            
            # GFS outputs surface geopotential in gpm (geopotential meters)
            # gpm is approximately equal to meters of elevation above sea level
            # No conversion needed - use values directly
            elevation = geop_surface.values
            
            lons = data.longitude.values
            lats = data.latitude.values
            
            print(f"Elevation range: {elevation.min():.0f}m / {elevation.max():.0f}m")
            
            return elevation, lons, lats
            
        except Exception as e:
            print(f"Failed to extract from GFS data: {e}")
    
    # Fallback: Try remote elevation sources
    print("Attempting to fetch elevation from remote sources...")
    
    sources = [
        {
            'name': 'GEBCO 2023 (NOAA)',
            'url': 'https://www.ncei.noaa.gov/thredds/dodsC/model-gebco-iso/GEBCO_2023.nc',
            'var': 'elevation'
        },
        {
            'name': 'SRTM 90m (DAAC)',
            'url': 'https://thredds.daac.ornl.gov/thredds/dodsC/ornldaac/1613/SRTM_GL30_Ellip/SRTM_GL30_Ellip_srtm/SRTM_GL30_Ellip_srtm_Australia.nc',
            'var': 'SRTM_DEM'
        },
    ]
    
    for source in sources:
        try:
            print(f"  Attempting {source['name']}...")
            url = source['url']
            ds = xr.open_dataset(url, decode_times=False, engine='netcdf4')
            print(f"  ✓ Successfully opened {source['name']}")
            return ds, None, None
        except Exception as e:
            print(f"    Failed: {str(e)[:80]}")
            continue
    
    print("Remote elevation sources unavailable. Creating synthetic Australia terrain...")
    
    # Create realistic synthetic elevation for Australia domain
    # Resolution: 0.25 degree grid (matching GFS)
    lons = np.arange(lon_min, lon_max, 0.25)
    lats = np.arange(lat_min, lat_max, 0.25)
    lon_grid, lat_grid = np.meshgrid(lons, lats)
    
    # Synthetic elevation with realistic features for Australia:
    # - Great Dividing Range in the east (elevated)
    # - Central lowlands/plateaus
    # - Western highlands
    # - Ocean areas (negative elevation)
    
    elevation = np.ones_like(lon_grid) * 200  # Base land elevation
    
    # Great Dividing Range (Eastern highlands) - lon ~150-155
    eastern_ridge = 800 * np.exp(-((lon_grid - 152)**2 / 8) - ((lat_grid + 30)**2 / 80))
    elevation = np.maximum(elevation, eastern_ridge)
    
    # Central plateau (raised central region)
    central_plateau = 400 * np.exp(-((lon_grid - 135)**2 / 40) - ((lat_grid + 25)**2 / 80))
    elevation = np.maximum(elevation, central_plateau)
    
    # Western highlands (Kimberley region)
    western_ridge = 600 * np.exp(-((lon_grid - 125)**2 / 25) - ((lat_grid + 28)**2 / 40))
    elevation = np.maximum(elevation, western_ridge)
    
    # Ocean areas (lon/lat outside Australia bounds)
    ocean_mask = ((lon_grid < 113) | (lon_grid > 154) | 
                  (lat_grid > -10) | (lat_grid < -44))
    elevation = np.where(ocean_mask, -1000, elevation)
    
    # Clamp elevation to realistic range
    elevation = np.clip(elevation, -1000, 2300)
    
    print(f"Created synthetic terrain grid: {elevation.shape}")
    print(f"Elevation range: {elevation.min():.0f}m to {elevation.max():.0f}m")
    
    return None, lons, lats, elevation

# Function to get latest GFS data
def get_gfs_data():
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
    
    forecast_time = init_time + timedelta(hours=9)
    
    ncss = NCSS(latest_dataset.access_urls['NetcdfSubset'])
    
    # Define query parameters
    query = ncss.query()
    query.lonlat_box(north=lat_max, south=lat_min, east=lon_max, west=lon_min)
    query.time(forecast_time)
    # query.vertical_level([10, 100000, 50000])  # Remove to allow different vertical coords
    var_list = ['MSLP_Eta_model_reduction_msl', 'Geopotential_height_isobaric', 
                'Geopotential_height_surface', 'Precipitation_rate_surface', 
                'u-component_of_wind_height_above_ground', 
                'v-component_of_wind_height_above_ground', 'Relative_humidity_isobaric']
    query.variables(*var_list)
    
    # Download data
    data = ncss.get_data(query)
    ds = xr.open_dataset(xr.backends.NetCDF4DataStore(data))
    return ds, init_time

# Function to plot the map
def plot_map(data, init_time, forecast_hour):
    fig = plt.figure(figsize=(12, 8))
    ax = fig.add_subplot(1, 1, 1, projection=ccrs.PlateCarree())
    
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
            # Also account for label offset (-0.25 lon, +0.25 lat) to keep labels inside domain
            if (lat_min <= lat <= lat_max and lon_min <= lon <= lon_max and
                lon - 0.25 >= lon_min and lat + 0.25 <= lat_max):
                taf_names.append(row['TAF'])
                taf_lats.append(lat)
                taf_lons.append(lon)
        print(f"Loaded {len(taf_names)} TAF locations within domain")
    except Exception as e:
        print(f"Warning: Could not load TAF locations: {e}")
    
    # Add features
    ax.add_feature(cfeature.COASTLINE)
    ax.add_feature(cfeature.BORDERS)
    
    # Add GAF boundaries from shapefile instead of state boundaries
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        gaf_shp = os.path.join(script_dir, 'geo files', 'GAF_Boundaries.shp')
        reader = Reader(gaf_shp)
        gaf_feature = ShapelyFeature(reader.geometries(), ccrs.PlateCarree(), 
                                     facecolor='none', edgecolor='black', linewidth=0.5)
        ax.add_feature(gaf_feature)
    except Exception as e:
        print(f"Warning: Could not load GAF boundaries: {e}")
        # Fallback to state boundaries if shapefile loading fails
        ax.add_feature(cfeature.STATES, linewidth=0.5)
    
    # Set extent
    ax.set_extent([lon_min, lon_max, lat_min, lat_max], crs=ccrs.PlateCarree())
    
    # Plot topography shading
    print("Plotting topography...")
    result = get_elevation_data(data)
    
    # Handle different return types
    elev = None
    lon_grid = None
    lat_grid = None
    
    if len(result) == 3:
        # GFS or remote data with real coordinates
        elev, elev_lons, elev_lats = result
        if elev_lons is not None and elev_lats is not None:
            if len(elev_lons.shape) == 1:
                lon_grid, lat_grid = np.meshgrid(elev_lons, elev_lats)
            else:
                lon_grid, lat_grid = elev_lons, elev_lats
        else:
            elev = None
    elif len(result) == 4:
        # Synthetic data returned (4 elements)
        ds, elev_lons, elev_lats, elev = result
        if elev_lons is not None:
            lon_grid, lat_grid = np.meshgrid(elev_lons, elev_lats)
        else:
            elev = None
    
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
    
    if elev is not None and lon_grid is not None and lat_grid is not None:
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
        ocean_mask = np.zeros_like(elev, dtype=bool)
        
        # Check each grid point - use prepared geometry for 10x speedup
        for i in range(min(elev.shape[0], elev.shape[0])):  # Iterate over first dimension
            for j in range(min(elev.shape[1], elev.shape[1])):  # Iterate over second dimension
                lon = lon_grid[i, j]
                lat = lat_grid[i, j]
                point = Point(lon, lat)
                
                # If point is NOT within land geometry, it's ocean
                if not land_prep.contains(point):
                    ocean_mask[i, j] = True
        
        print(f"Identified {np.sum(ocean_mask)} ocean grid points out of {elev.size} total")
        
        # Create a modified elevation array where ocean areas are set to -1000
        elev_masked = elev.copy()
        elev_masked[ocean_mask] = -1000
        
        cs_topo = ax.contourf(
            lon_grid,
            lat_grid,
            elev_masked,
            levels=elev_levels,
            cmap=elev_cmap,
            norm=elev_norm,
            alpha=0.4,
            extend='both',
            transform=ccrs.PlateCarree())
    
    # Plot MSLP
    mslp = get_time_index(data['MSLP_Eta_model_reduction_msl']) / 100  # Convert to hPa
    cs_mslp = ax.contour(data.longitude, data.latitude, mslp, levels=np.arange(980, 1040, 4), colors='black', linewidths=1)
    ax.clabel(cs_mslp, inline=True, fontsize=8)
    
    # Plot thickness (1000-500 hPa)
    hgt_1000 = get_time_index(data['Geopotential_height_isobaric'].sel(isobaric=100000)) / 10  # Convert to dam
    hgt_500 = get_time_index(data['Geopotential_height_isobaric'].sel(isobaric=50000)) / 10
    thickness = hgt_500 - hgt_1000
    
    # Define major and minor levels
    major_levels = np.arange(480, 602, 18)
    all_minor_levels = np.arange(480, 602, 6)
    
    # Plot only minor lines that are NOT major lines
    major_levels_set = set(major_levels)
    minor_only_levels = np.array([x for x in all_minor_levels if x not in major_levels_set])
    
    cs_thickness_minor = ax.contour(data.longitude, data.latitude, thickness, levels=minor_only_levels, 
                                     colors='red', linewidths=1, linestyles='dashed')
    
    # Plot major interval lines (spacing of 18, blue)
    cs_thickness_major = ax.contour(data.longitude, data.latitude, thickness, levels=major_levels, 
                                     colors='blue', linewidths=1, linestyles='dashed')
    ax.clabel(cs_thickness_major, inline=True, fontsize=8, fmt='%d')
    
    # Plot low cloud layer (maxRH at 1000, 975, 950 hPa)
    rh_1000 = get_time_index(data['Relative_humidity_isobaric'].sel(isobaric=100000))
    rh_975 = get_time_index(data['Relative_humidity_isobaric'].sel(isobaric=97500))
    rh_950 = get_time_index(data['Relative_humidity_isobaric'].sel(isobaric=95000))
    
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
        transform=ccrs.PlateCarree())
    
    # Plot drizzle layer (average RH at 950, 900, 850 hPa)
    rh_950_drizzle = get_time_index(data['Relative_humidity_isobaric'].sel(isobaric=95000))
    rh_900 = get_time_index(data['Relative_humidity_isobaric'].sel(isobaric=90000))
    rh_850 = get_time_index(data['Relative_humidity_isobaric'].sel(isobaric=85000))
    
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
        transform=ccrs.PlateCarree())
    
    # Plot 1hr precipitation with custom colormap from XML
    precip = get_time_index(data['Precipitation_rate_surface']) * 3600  # Convert to mm/hr
    
    # Mask out precipitation below 0.1 mm/hr to show low clouds underneath
    precip_masked = precip.where(precip >= 0.1, np.nan)
    
    # Precipitation levels and colors from 1hrprecip.xml
    precip_levels = [0, 0.1, 0.2, 0.5, 1, 2, 5, 7.5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
    precip_colors = [
        (255, 255, 255),  # 0 - white
        (240, 255, 150),  # 0.1 - light yellow
        (240, 255, 60),   # 0.2 - bright yellow
        (255, 255, 0),    # 0.5 - yellow
        (200, 255, 0),    # 1 - yellow-green
        (150, 255, 0),    # 2 - light green
        (0, 150, 0),      # 5 - green
        (0, 175, 128),    # 7.5 - teal
        (0, 200, 255),    # 10 - light cyan
        (0, 150, 255),    # 15 - cyan
        (0, 0, 255),      # 20 - blue
        (0, 0, 255),      # 25 - blue
        (255, 100, 0),    # 30 - orange
        (255, 50, 0),     # 35 - orange-red
        (255, 0, 0),      # 40 - red
        (200, 0, 0),      # 45 - dark red
        (50, 0, 0)        # 50 - maroon
    ]
    
    # Normalize RGB values to 0-1 range
    precip_colors_norm = [(r/255.0, g/255.0, b/255.0) for r, g, b in precip_colors]
    precip_cmap = ListedColormap(precip_colors_norm)
    precip_norm = BoundaryNorm(precip_levels, precip_cmap.N, clip=True)
    
    cs_precip = ax.contourf(
        data.longitude,
        data.latitude,
        precip_masked,
        levels=precip_levels,
        cmap=precip_cmap,
        norm=precip_norm,
        alpha=1.0,
        extend='max',
        transform=ccrs.PlateCarree())
    
    # Plot SFC winds
    u_wind = get_time_index(data['u-component_of_wind_height_above_ground'].sel(height_above_ground2=10))
    v_wind = get_time_index(data['v-component_of_wind_height_above_ground'].sel(height_above_ground2=10))
    ax.barbs(data.longitude[::10], data.latitude[::10], u_wind.values[::10, ::10], v_wind.values[::10, ::10], 
             length=5, linewidth=0.5, color='#800000')
    
    # Plot TAF locations with filtering based on text bounding boxes
    if taf_lons:  # Only plot if TAF data was loaded successfully
        # Plot tiny dots to mark TAF locations
        ax.scatter(taf_lons, taf_lats, s=2, c='black', marker='o', zorder=100, transform=ccrs.PlateCarree())
        
        # Track which points to keep
        points_to_keep = []
        
        # Create text objects for all TAF names
        text_objects = []
        for idx, (lon, lat, name) in enumerate(zip(taf_lons, taf_lats, taf_names)):
            text_obj = ax.text(lon - 0.25, lat + 0.25, name, fontsize=6, ha='right', va='bottom', 
                              family='Tahoma', zorder=101, transform=ccrs.PlateCarree())
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
    
    # Add title
    title = f'GFS Forecast +{forecast_hour}hrs\nInit: {init_time.strftime("%Y-%m-%d %HZ")}\nValid: {(init_time + timedelta(hours=forecast_hour)).strftime("%Y-%m-%d %HZ")}'
    ax.set_title(title)
    
    return fig

# Main function
def main():
    # Get data
    data, init_time = get_gfs_data()
    
    forecast_hour = 9
    
    # Plot map
    fig = plot_map(data, init_time, forecast_hour)
    
    # Create output directory if it doesn't exist
    output_dir = 'images/BG/US'
    os.makedirs(output_dir, exist_ok=True)
    
    # Save image
    filename = f'GFS_{init_time.strftime("%Y%m%d_%H")}_{forecast_hour:02d}.png'
    filepath = os.path.join(output_dir, filename)
    fig.savefig(filepath, dpi=150, bbox_inches='tight')
    plt.close(fig)
    
    print(f'Map saved to {filepath}')

if __name__ == '__main__':
    main()