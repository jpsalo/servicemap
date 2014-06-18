define ['backbone', 'leaflet'], (Backbone, L) ->
    # General functions taken from https://github.com/HSLdevcom/navigator-proto

    # Original structure from:
    # https://github.com/reitti/reittiopas/blob/90a4d5f20bed3868b5fb608ee1a1c7ce77b70ed8/web/js/utils.coffee
    hsl_colors =
        walk: '#9ab9c9' # walking; HSL official color is too light #bee4f8
        wait: '#999999' # waiting time at a stop
        1:    '#007ac9' # Helsinki internal bus lines
        2:    '#00985f' # Trams
        3:    '#007ac9' # Espoo internal bus lines
        4:    '#007ac9' # Vantaa internal bus lines
        5:    '#007ac9' # Regional bus lines
        6:    '#ff6319' # Metro
        7:    '#00b9e4' # Ferry
        8:    '#007ac9' # U-lines
        12:   '#64be14' # Commuter trains
        21:   '#007ac9' # Helsinki service lines
        22:   '#007ac9' # Helsinki night buses
        23:   '#007ac9' # Espoo service lines
        24:   '#007ac9' # Vantaa service lines
        25:   '#007ac9' # Region night buses
        36:   '#007ac9' # Kirkkonummi internal bus lines
        38:   '#007ac9' # Undocumented, assumed bus
        39:   '#007ac9' # Kerava internal bus lines
    google_colors =
        WALK: hsl_colors.walk
        CAR: hsl_colors.walk
        BICYCLE: hsl_colors.walk
        WAIT: hsl_colors.wait
        0: hsl_colors[2]
        1: hsl_colors[6]
        2: hsl_colors[12]
        3: hsl_colors[5]
        4: hsl_colors[7]
        109: hsl_colors[12]


    # Route received from OTP is encoded so it needs to be decoded.
    # translated from https://github.com/ahocevar/openlayers/blob/master/lib/OpenLayers/Format/EncodedPolyline.js
    decode_polyline = (encoded, dims) ->
        # Start from origo
        point = (0 for i in [0...dims])

        # Loop over the encoded input string
        i = 0
        points = while i < encoded.length
            for dim in [0...dims]
                result = 0
                shift = 0
                loop
                    b = encoded.charCodeAt(i++) - 63
                    result |= (b & 0x1f) << shift
                    shift += 5
                    break unless b >= 0x20

                point[dim] += if result & 1 then ~(result >> 1) else result >> 1

            # Keep a copy in the result list
            point.slice(0)

        return points

    # (taken from https://github.com/HSLdevcom/navigator-proto)
    # clean up oddities in routing result data from OTP
    otp_cleanup = (data) ->
        for itinerary in data.plan?.itineraries or []
            legs = itinerary.legs
            length = legs.length
            last = length-1

            # if there's time past walking in either end, add that to walking
            # XXX what if it's not walking?
            if not legs[0].routeType and legs[0].startTime != itinerary.startTime
                legs[0].startTime = itinerary.startTime
                legs[0].duration = legs[0].endTime - legs[0].startTime
            if not legs[last].routeType and legs[last].endTime != itinerary.endTime
                legs[last].endTime = itinerary.endTime
                legs[last].duration = legs[last].endTime - legs[last].startTime

            new_legs = []
            time = itinerary.startTime # tracks when next leg should start
            for leg in itinerary.legs
                # Route received from OTP is encoded so it needs to be decoded.
                points = decode_polyline leg.legGeometry.points, 2
                points = ((x * 1e-5 for x in coords) for coords in points)
                leg.legGeometry.points = points

                # if there's unaccounted time before a walking leg
                if leg.startTime - time > 1000 and leg.routeType == null
                    # move non-transport legs to occur before wait time
                    wait_time = leg.startTime-time
                    time = leg.endTime
                    leg.startTime -= wait_time
                    leg.endTime -= wait_time
                    new_legs.push leg
                    # add the waiting time as a separate leg
                    new_legs.push create_wait_leg leg.endTime, wait_time,
                        _.last(leg.legGeometry.points), leg.to.name
                # else if there's unaccounted time before a leg
                else if leg.startTime - time > 1000
                    wait_time = leg.startTime-time
                    time = leg.endTime
                    # add the waiting time as a separate leg
                    new_legs.push create_wait_leg leg.startTime - wait_time,
                        wait_time, leg.legGeometry.points[0], leg.from.name
                    new_legs.push leg
                else
                    new_legs.push leg
                    time = leg.endTime # next leg should start when this ended
            itinerary.legs = new_legs
        return data

    create_wait_leg = (start_time, duration, point, placename) ->
        leg =
            mode: "WAIT"
            routeType: null # non-transport
            route: ""
            duration: duration
            startTime: start_time
            endTime: start_time + duration
            legGeometry: {points: [point]}
            from:
                lat: point[0]
                lon: point[1]
                name: placename
        leg.to = leg.from
        return leg

    # Renders each leg of the route to the map and also draws icons of real-time vehicle
    # locations to the map if available.
    render_route_layer = (itinerary, route_layer) ->
        legs = itinerary.legs

        sum = (xs) -> _.reduce(xs, ((x, y) -> x+y), 0)
        total_walking_distance = sum(leg.distance for leg in legs when leg.distance and not leg.routeType?)
        total_walking_duration = sum(leg.duration for leg in legs when leg.distance and not leg.routeType?)

        route_includes_transit = _.any(leg.routeType? for leg in legs)

        mins = Math.ceil(itinerary.duration/1000/60)
        walk_mins = Math.ceil(total_walking_duration/1000/60)
        walk_kms = Math.ceil(total_walking_distance/100)/10

        for leg in legs
            points = (new L.LatLng(point[0], point[1]) for point in leg.legGeometry.points)
            color = google_colors[leg.routeType ? leg.mode]
            # For walking a dashed line is used
            if leg.routeType?
                dash_array = null
            else
                dash_array = "5,10"
                color = "#000" # override line color to black for visibility

            style = {color: color, weight: 8, opacity: 0.2, clickable: false, dashArray: dash_array}
            polyline = new L.Polyline points, style
            polyline.addTo route_layer # The route leg line is added to the routeLayer

            style = {color: color, opacity: 0.4, dashArray: dash_array}
            polyline = new L.Polyline points, style
            # Make zooming to the leg via click possible.
            polyline.on 'click', (e) ->
                    mapfitBounds(polyline.getBounds())
                    if marker?
                        marker.openPopup()
            polyline.addTo route_layer

            # Always show route and time information at the leg start position
            if false
                stop = leg.from
                last_stop = leg.to
                point = {y: stop.lat, x: stop.lon}
                icon = L.divIcon({className: "navigator-div-icon"})
                label = "<span style='font-size: 24px;'><img src='static/images/#{google_icons[leg.routeType ? leg.mode]}' style='vertical-align: sub; height: 24px'/><span>#{leg.route}</span></span>"

                marker = L.marker(new L.LatLng(point.y, point.x), {icon: icon}).addTo(routeLayer)
                    .bindPopup("<b>Time: #{moment(leg.startTime).format("HH:mm")}&mdash;#{moment(leg.endTime).format("HH:mm")}</b><br /><b>From:</b> #{stop.name or ""}<br /><b>To:</b> #{last_stop.name or ""}")

            # The row causes all legs polylines to be returned as array from the render_route_layer function.
            # polyline is graphical representation of the leg.
            polyline

    OTP_URL = 'http://144.76.78.72/otp/routers/default/plan'
    class Route
        constructor: ->
            _.extend @, Backbone.Events

        plan: (from, to, opts) ->
            data =
                fromPlace: from
                toPlace: to
                mode: 'TRANSIT,WALK'
                numItineraries: 1
                maxWalkDistance: 3000

            args =
                dataType: 'json'
                url: OTP_URL
                data: data
                success: (data) =>
                    if 'error' of data
                        @trigger 'error'
                        return

                    data = otp_cleanup data
                    @plan = data.plan
                    @trigger 'plan', @plan
                error: =>
                    @trigger 'error'

            $.ajax args

        draw_itinerary: (map) ->
            it = @plan.itineraries[0]
            if @route_layer?
                @clear_itinerary map
            @route_layer = L.featureGroup().addTo map
            render_route_layer it, @route_layer
            console.log 'draw_itinerary'
            console.log @route_layer

        clear_itinerary: (map) ->
            if not @route_layer?
                return
            console.log 'clear_itinerary'
            map.removeLayer @route_layer
            console.log @route_layer
            @route_layer = null

    exports =
        Route: Route