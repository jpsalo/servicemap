define [
    'backbone',
    'backbone.marionette',
    'i18next',
    'leaflet',
    'leaflet.markercluster',
    'app/map',
    'app/widgets',
    'app/jade'
], (
    Backbone,
    Marionette,
    i18n,
    leaflet,
    markercluster,
    map,
    widgets,
    jade
) ->

    # TODO: remove duplicates
    MARKER_POINT_VARIANT = false
    DEFAULT_CENTER = [60.171944, 24.941389] # todo: depends on city
    ICON_SIZE = 40
    VIEWPOINTS =
        # meters to show everything within in every direction
        singleUnitImmediateVicinity: 200
    if getIeVersion() and getIeVersion() < 9
        ICON_SIZE *= .8

    _latitudeDeltaFromRadius = (radiusMeters) ->
        (radiusMeters / 40075017) * 360
    _longitudeDeltaFromRadius = (radiusMeters, latitude) ->
        _latitudeDeltaFromRadius(radiusMeters) / Math.cos(L.LatLng.DEG_TO_RAD * latitude)

    boundsFromRadius = (radiusMeters, latLng) ->
        delta = L.latLng _latitudeDeltaFromRadius(radiusMeters),
            _longitudeDeltaFromRadius(radiusMeters, latLng.lat)
        min = L.latLng latLng.lat - delta.lat, latLng.lng - delta.lng
        max = L.latLng latLng.lat + delta.lat, latLng.lng + delta.lng
        L.latLngBounds [min, max]

    class MapBaseView extends Backbone.Marionette.View
        zoomlevelSinglePoint: (latLng, viewpoint) ->
            bounds = boundsFromRadius VIEWPOINTS[viewpoint], latLng
            @map.getBoundsZoom bounds
        initialize: (opts) ->
            @markers = {}
        mapOptions: {}
        render: ->
            @$el.attr 'id', 'map'
        getMap: ->
            @map
        onShow: ->
            # The map is created only after the element is added
            # to the DOM to work around Leaflet init issues.
            mapStyle =
                if p13n.getAccessibilityMode 'color_blind'
                    'accessible_map'
                else
                    p13n.get 'map_background_layer'
            options =
                style: mapStyle
                language: p13n.getLanguage()
            @map = map.MapMaker.createMap @$el.get(0), options, @mapOptions
            @allMarkers = @getFeatureGroup()
            @allMarkers.addTo @map
            @postInitialize()
        highlightUnselectedUnit: (unit) ->
            # Transiently highlight the unit which is being moused
            # over in search results or otherwise temporarily in focus.
            marker = unit.marker
            popup = marker?.getPopup()
            if popup?.selected
                return
            @clearPopups()
            parent = @allMarkers.getVisibleParent unit.marker
            if popup?
                $(marker._popup._wrapper).removeClass 'selected'
                popup.setLatLng marker?.getLatLng()
                @popups.addLayer popup
        clearPopups: (clearSelected) ->
            @popups.eachLayer (layer) =>
                if clearSelected
                    layer.selected = false
                    @popups.removeLayer layer
                else unless layer.selected
                    @popups.removeLayer layer

        highlightUnselectedCluster: (cluster) ->
            # Maximum number of displayed names per cluster.
            COUNT_LIMIT = 3
            @clearPopups()
            childCount = cluster.getChildCount()
            names = _.map cluster.getAllChildMarkers(), (marker) ->
                    p13n.getTranslatedAttr marker.unit.get('name')
                .sort()
            data = {}
            overflowCount = childCount - COUNT_LIMIT
            if overflowCount > 1
                names = names[0...COUNT_LIMIT]
                data.overflow_message = i18n.t 'general.more_units',
                    count: overflowCount
            data.names = names
            popuphtml = jade.getTemplate('popup_cluster') data
            popup = @createPopup()
            popup.setLatLng cluster.getBounds().getCenter()
            popup.setContent popuphtml
            @map.on 'zoomstart', =>
                @popups.removeLayer popup
            @popups.addLayer popup

        _addMouseoverListeners: (markerClusterGroup)->
            markerClusterGroup.on 'clustermouseover', (e) =>
                @highlightUnselectedCluster e.layer
            markerClusterGroup.on 'mouseover', (e) =>
                @highlightUnselectedUnit e.layer.unit
            markerClusterGroup.on 'spiderfied', (e) =>
                icon = $(e.target._spiderfied?._icon)
                icon?.fadeTo('fast', 0)
        postInitialize: ->
            @_addMouseoverListeners @allMarkers
            @popups = L.layerGroup()
            @popups.addTo @map
        latLngFromGeojson: (object) =>
            object?.get('location')?.coordinates?.slice(0).reverse()
        getZoomlevelToShowAllMarkers: ->
            layer = p13n.get('map_background_layer')
            if layer == 'guidemap'
                return 8
            else if layer == 'ortographic'
                return 8
            else
                return 14
        createClusterIcon: (cluster) ->
            count = cluster.getChildCount()
            serviceCollection = new models.ServiceList()
            markers = cluster.getAllChildMarkers()
            _.each markers, (marker) =>
                unless marker.unit?
                    return
                service = new models.Service
                    id: marker.unit.get('root_services')[0]
                    root: marker.unit.get('root_services')[0]
                serviceCollection.add service

            colors = serviceCollection.map (service) =>
                app.colorMatcher.serviceColor(service)

            if MARKER_POINT_VARIANT
                ctor = widgets.PointCanvasClusterIcon
            else
                ctor = widgets.CanvasClusterIcon
            new ctor count, ICON_SIZE, colors, serviceCollection.first().id
        getFeatureGroup: ->
            L.markerClusterGroup
                showCoverageOnHover: false
                maxClusterRadius: (zoom) =>
                    return if (zoom >= @getZoomlevelToShowAllMarkers()) then 4 else 30
                iconCreateFunction: (cluster) =>
                    @createClusterIcon(cluster)
        createMarker: (unit) ->
            id = unit.get 'id'
            if id of @markers
                return @markers[id]
            htmlContent = "<div class='unit-name'>#{unit.getText 'name'}</div>"
            popup = @createPopup().setContent htmlContent
            icon = @createIcon unit, @selectedServices
            marker = L.marker @latLngFromGeojson(unit),
                icon: icon
                zIndexOffset: 100
            marker.unit = unit
            unit.marker = marker
            if @selectMarker?
                @listenTo marker, 'click', @selectMarker

            marker.bindPopup(popup)
            @markers[id] = marker
        createPopup: (offset) ->
            opts =
                closeButton: false
                autoPan: false
                zoomAnimation: false
                minWidth: 500
                className: 'unit'
            if offset? then opts.offset = offset
            new widgets.LeftAlignedPopup opts
        createIcon: (unit, services) ->
            color = app.colorMatcher.unitColor(unit) or 'rgb(255, 255, 255)'
            if MARKER_POINT_VARIANT
                ctor = widgets.PointCanvasIcon
            else
                ctor = widgets.PlantCanvasIcon
            new ctor ICON_SIZE, color, unit.id
        showAllUnitsAtHighZoom: ->
            if $(window).innerWidth() <= appSettings.mobile_ui_breakpoint
                return
            zoom = @map.getZoom()
            if zoom >= @getZoomlevelToShowAllMarkers()
                if (@selectedUnits.isSet() and @map.getBounds().contains(@selectedUnits.first().marker.getLatLng()))
                    # Don't flood a selected unit's surroundings
                    return
                if @selectedServices.isSet()
                    return
                if @searchResults.isSet()
                    return
                transformedBounds = map.MapUtils.overlappingBoundingBoxes @map
                bboxes = []
                for bbox in transformedBounds
                    bboxes.push "#{bbox[0][0]},#{bbox[0][1]},#{bbox[1][0]},#{bbox[1][1]}"
                app.commands.execute 'addUnitsWithinBoundingBoxes', bboxes
            else
                app.commands.execute 'clearUnits', all: false, bbox: true

    return MapBaseView