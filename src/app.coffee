requirejsConfig =
    baseUrl: appSettings.static_path + 'vendor'
    paths:
        app: '../js'
    shim:
        bootstrap:
            deps: ['jquery']
        backbone:
            deps: ['underscore', 'jquery']
            exports: 'Backbone'
        'typeahead.bundle':
            deps: ['jquery']
        TweenLite:
            deps: ['CSSPlugin', 'EasePack']
        'leaflet.markercluster':
            deps: ['leaflet']
        'leaflet.activearea':
            deps: ['leaflet']
        'bootstrap-datetimepicker':
            deps: ['bootstrap']
        'bootstrap-tour':
            deps: ['bootstrap']
        'iexhr':
            deps: ['jquery']

requirejs.config requirejsConfig

requirejs ['leaflet'], (L) ->
    # Allow calling original getBounds when needed.
    # (leaflet.activearea overrides getBounds)
    L.Map.prototype._originalGetBounds = L.Map.prototype.getBounds

PAGE_SIZE = 1000
DEBUG_STATE = appSettings.debug_state
VERIFY_INVARIANTS = appSettings.verify_invariants

window.getIeVersion = ->
    isInternetExplorer = ->
        window.navigator.appName is "Microsoft Internet Explorer"

    if not isInternetExplorer()
        return false

    matches = new RegExp(" MSIE ([0-9]+)\\.([0-9])").exec window.navigator.userAgent
    return parseInt matches[1]

if appSettings.sentry_url
    config = {}
    if appSettings.sentry_disable
        config.shouldSendCallback = -> false
    requirejs ['raven'], (Raven) ->
        Raven.config(appSettings.sentry_url, config).install()
        Raven.setExtraContext gitCommit: appSettings.git_commit_id

requirejs [
    'app/models',
    'app/p13n',
    'app/map-view',
    'app/landing',
    'app/color',
    'app/tour',
    'backbone',
    'backbone.marionette',
    'jquery',
    'i18next',
    'app/uservoice',
    'app/transit',
    'app/debug',
    'iexhr',
    'app/views/service-cart',
    'app/views/navigation',
    'app/views/personalisation',
    'app/views/language-selector',
    'app/views/title',
    'app/base',

],
(
    Models,
    p13n,
    MapView,
    landingPage,
    ColorMatcher,
    tour,
    Backbone,
    Marionette,
    $,
    i18n,
    uservoice,
    transit,
    debug,
    iexhr,
    ServiceCartView,
    NavigationLayout,
    PersonalisationView,
    LanguageSelectorView,
    titleViews,
    sm
) ->

    class AppControl
        constructor: (appModels) ->
            _.extend @, Backbone.Events

            # Units currently on the map
            @units = appModels.units
            # Services in the cart
            @services = appModels.selectedServices
            # Selected units (always of length one)
            @selectedUnits = appModels.selectedUnits
            # Selected events (always of length one)
            @selectedEvents = appModels.selectedEvents
            @searchResults = appModels.searchResults
            @searchState = appModels.searchState
            @route = appModels.route

            @selectedPosition = appModels.selectedPosition

            @listenTo p13n, 'change', (path, val) ->
                if path[path.length - 1] == 'city'
                    @_reFetchAllServiceUnits()

            if DEBUG_STATE
                @eventDebugger = new debug.EventDebugger @

        atMostOneIsSet: (list) ->
            _.filter(list, (o) -> o.isSet()).length <= 1

        _verifyInvariants: ->
            unless @atMostOneIsSet [@services, @searchResults]
                return new Error "Active services and search results are mutually exclusive."
            unless @atMostOneIsSet [@selectedPosition, @selectedUnits]
                return new Error "Selected positions/units/events are mutually exclusive."
            unless @atMostOneIsSet [@searchResults, @selectedPosition]
                return new Error "Search results & selected position are mutually exclusive."
            return null

        _setSelectedUnits: (units, options) ->
            @selectedUnits.each (u) -> u.set 'selected', false
            if units?
                _(units).each (u) -> u.set 'selected', true
                @selectedUnits.reset units, options
            else
                if @selectedUnits.length
                    @selectedUnits.reset [], options

        reset: () ->
            @_setSelectedUnits()
            @selectedPosition.clear()
            @route.clear()
            @units.reset []
            @services.reset [], silent: true
            @selectedEvents.reset []
            @searchState.clear silent: true
            @_resetSearchResults()

        isStateEmpty: () ->
            @selectedPosition.isEmpty() and
            @services.isEmpty() and
            @selectedEvents.isEmpty()

        _resetSearchResults: ->
            @searchResults.query = null
            @searchResults.reset []
            if @selectedUnits.isSet()
                @units.reset [@selectedUnits.first()]
            else if not @units.isEmpty()
                @units.reset()

        setUnits: (units, filter) ->
            @services.set []
            @_setSelectedUnits()
            @units.reset units.toArray()
            if filter?
                @units.setFilter filter, true
            else
                @units.clearFilters()
            # Current cluster based map logic
            # requires batch reset signal.
        setUnit: (unit) ->
            @services.set []
            @units.reset [unit]
        clearUnits: (opts) ->
            # Only clears selected units, and bbox units,
            # not removed service units nor search results.
            @route.clear()
            if @searchResults.isSet()
                return
            if @services.isSet()
                return
            if opts?.bbox == false and 'bbox' of @units.filters
                return
            if opts?.all
                @units.clearFilters()
                @units.reset [], bbox: true
                return
            else if opts?.bbox and 'bbox' not of @units.filters
                return
            @units.clearFilters()
            resetOpts = bbox: opts?.bbox
            if opts.silent
                resetOpts.silent = true
            if opts?.bbox
                resetOpts.noRefit = true
            if @selectedUnits.isSet()
                @units.reset [@selectedUnits.first()], resetOpts
            else
                @units.reset [], resetOpts
        getUnit: (id) ->
            return @units.get id
        addUnitsWithinBoundingBoxes: (bboxStrings) ->
            @units.clearFilters()
            getBbox = (bboxStrings) =>
                # Fetch bboxes sequentially
                if bboxStrings.length == 0
                    @units.setFilter 'bbox', true
                    @units.trigger 'finished',
                        keepViewport: true
                    return
                bboxString = _.first bboxStrings
                unitList = new models.UnitList()
                opts = success: (coll, resp, options) =>
                    if unitList.length
                        @units.add unitList.toArray()
                    unless unitList.fetchNext(opts)
                        unitList.trigger 'finished',
                            keepViewport: true
                unitList.pageSize = PAGE_SIZE
                unitList.setFilter 'bbox', bboxString
                layer = p13n.get 'map_background_layer'
                unitList.setFilter 'bbox_srid', if layer in ['servicemap', 'accessible_map'] then 3067 else 3879
                unitList.setFilter 'only', 'name,location,root_services'
                # Default exclude filter: statues, wlan hot spots
                unitList.setFilter 'exclude_services', '25658,25538'
                @listenTo unitList, 'finished', =>
                    getBbox _.rest(bboxStrings)
                unitList.fetch(opts)
            getBbox(bboxStrings)

        highlightUnit: (unit) ->
            @units.trigger 'unit:highlight', unit
        selectUnit: (unit, opts) ->
            @_setSelectedUnits [unit], silent: true
            if opts?.replace
                @units.reset [unit]
                @units.clearFilters()
            else if unit not in @units
                @units.add unit
                @units.trigger 'reset', @units
            @selectedPosition.clear()
            filters = unit.collection?.filters
            department = unit.get 'department'
            municipality = unit.get 'municipality'
            if department? and typeof department == 'object' and municipality? and typeof municipality == 'object'
                 @selectedUnits.trigger 'reset', @selectedUnits
                 sm.resolveImmediately()
            else
                unit.fetch
                    data: include: 'department,municipality,services'
                    success: => @selectedUnits.trigger 'reset', @selectedUnits
        renderUnitById: (id) ->
            deferred = $.Deferred()
            unit = new Models.Unit id: id
            unit.fetch
                data:
                    include: 'department,municipality'
                success: =>
                    deferred.resolve unit
            deferred.promise()
        clearSelectedUnit: ->
            @route.clear()
            @selectedUnits.each (u) -> u.set 'selected', false
            @_setSelectedUnits()
            @clearUnits all: false, bbox: false
            sm.resolveImmediately()

        selectEvent: (event) ->
            unit = event.getUnit()
            select = =>
                event.set 'unit', unit
                if unit?
                    @setUnit unit
                @selectedEvents.reset [event]
            if unit?
                unit.fetch
                    success: select
            else
                select()

        selectPosition: (position) ->
            @clearSearchResults()
            @_setSelectedUnits()
            if position == @selectedPosition.value()
                @selectedPosition.trigger 'change:value', @selectedPosition
            else
                @selectedPosition.wrap position
            sm.resolveImmediately()
        clearSelectedPosition: ->
            @selectedPosition.clear()
            sm.resolveImmediately()

        clearSelectedEvent: ->
            @selectedEvents.set []
        removeUnit: (unit) ->
            @units.remove unit
            if unit == @selectedUnits.first()
                @clearSelectedUnit()
        removeUnits: (units) ->
            @units.remove units,
                silent: true
            @units.trigger 'batch-remove',
                removed: units

        _addService: (service) ->
            @_setSelectedUnits()
            @services.add service
            if @services.length == 1
                # Remove possible units
                # that had been added through
                # other means than service
                # selection.
                @units.reset []
                @units.clearFilters()
                @clearSearchResults()

            if service.has 'ancestors'
                ancestor = @services.find (s) ->
                    s.id in service.get 'ancestors'
                if ancestor?
                    @removeService ancestor
            @_fetchServiceUnits service

        _reFetchAllServiceUnits: ->
            if @services.length > 0
                @units.reset []
                @services.each (s) => @_fetchServiceUnits(s)

        _fetchServiceUnits: (service) ->
            unitList = new models.UnitList [], pageSize: PAGE_SIZE
                .setFilter('service', service.id)
                .setFilter('only', 'name,location,root_services')

            municipality = p13n.get 'city'
            if municipality
                unitList.setFilter 'municipality', municipality

            opts =
                # todo: re-enable
                #spinnerTarget: spinnerTarget
                success: =>
                    @units.add unitList.toArray(), merge: true
                    service.get('units').add unitList.toArray()
                    unless unitList.fetchNext opts
                        @units.trigger 'finished', refit: true
                        service.get('units').trigger 'finished'

            unitList.fetch opts

        addService: (service) ->
            if service.has('ancestors')
                @_addService service
            else
                sm.withDeferred (deferred) =>
                    service.fetch
                        data: include: 'ancestors'
                        success: =>
                            @_addService(service).done =>
                                deferred.resolve()

        removeService: (serviceId) ->
            service = @services.get serviceId
            @services.remove service
            unless service.get('units')?
                return
            otherServices = @services.filter (s) => s != service
            unitsToRemove = service.get('units').reject (unit) =>
                @selectedUnits.get(unit)? or
                _(otherServices).find (s) => s.get('units').get(unit)?
            @removeUnits unitsToRemove
            if @services.size() == 0
                if @selectedPosition.isSet()
                    @selectPosition @selectedPosition.value()
                    @selectedPosition.trigger 'change:value', @selectedPosition
            sm.resolveImmediately()

        _search: (query) ->
            @selectedPosition.clear()
            @clearUnits all: true
            @searchState.set 'input_query', query,
                initial: true
            @searchState.trigger 'change', @searchState,
                initial: true

            if @searchResults.query == query
                @searchResults.trigger 'ready'
                return

            if 'search' in _(@units.filters).keys()
                @units.reset []

            unless @searchResults.isEmpty()
                @searchResults.reset []
            opts =
                success: =>
                    if _paq?
                        _paq.push ['trackSiteSearch', query, false, @searchResults.models.length]
                    @units.add @searchResults.filter (r) ->
                        r.get('object_type') == 'unit'
                    @units.setFilter 'search', true
                    unless @searchResults.fetchNext opts
                        @searchResults.trigger 'ready'
                        @units.trigger 'finished'
                        @services.set []
            opts = @searchResults.search query, opts
        search: (query) ->
            unless query?
                query = @searchResults.query
            if query? and query.length > 0
                @_search query
            sm.resolveImmediately()

        clearSearchResults: () ->
            @searchState.set 'input_query', null, clearing: true
            @searchResults.query = null
            if not @searchResults.isEmpty()
                @_resetSearchResults()
            sm.resolveImmediately()

        closeSearch: ->
            if @isStateEmpty() then @home()
            sm.resolveImmediately()

        home: ->
            @reset()

        renderUnitsByServices: (serviceIdString) ->
            serviceIds = serviceIdString.split ','
            deferreds = _.map serviceIds, (id) =>
                @addService new models.Service id: id
            return $.when deferreds...
        renderHome: ->
            @reset()
            sm.resolveImmediately()
        renderAddress: (municipality, streetAddressSlug) ->
            sm.withDeferred (deferred) =>
                slug = "#{municipality}/#{streetAddressSlug}"
                positionList = models.PositionList.fromSlug slug
                @listenTo positionList, 'sync', (p) =>
                    if p.length == 0
                        throw new Error 'Address slug not found'
                    else if p.length == 1
                        position = p.pop()
                    else if p.length > 1
                        exactMatch = p.filter (pos) ->
                            if slug[slug.length-1].toLowerCase() == pos.get('letter').toLowerCase()
                                return true
                            false
                        if exactMatch.length != 1
                            throw new Error 'Too many address matches'
                        position = exactMatch.pop()
                    @selectPosition(position)
                    deferred.resolve()

    app = new Marionette.Application()

    appModels =
        services: new Models.ServiceList()
        selectedServices: new Models.ServiceList()
        units: new Models.UnitList()
        selectedUnits: new Models.UnitList()
        selectedEvents: new Models.EventList()
        searchResults: new Models.SearchList [], pageSize: PAGE_SIZE
        searchState: new Models.WrappedModel()
        route: new transit.Route()
        routingParameters: new Models.RoutingParameters()
        selectedPosition: new Models.WrappedModel()
        userClickCoordinatePosition: new Models.WrappedModel()

    cachedMapView = null
    makeMapView = ->
        unless cachedMapView
            cachedMapView = new MapView
                units: appModels.units
                services: appModels.selectedServices
                selectedUnits: appModels.selectedUnits
                searchResults: appModels.searchResults
                userClickCoordinatePosition: appModels.userClickCoordinatePosition
                selectedPosition: appModels.selectedPosition
                route: appModels.route

            window.mapView = cachedMapView
            map = cachedMapView.map
            app.getRegion('map').show cachedMapView
            f = -> landingPage.clear()
            cachedMapView.map.addOneTimeEventListener
                'zoomstart': f
                'mousedown': f
        cachedMapView

    setSiteTitle = (routeTitle) ->
        # Sets the page title. Should be called when the view that is
        # considered the main view changes.
        title = "#{i18n.t('general.site_title')}"
        if routeTitle
            title = "#{p13n.getTranslatedAttr(routeTitle)} | " + title
        $('head title').text title

    class AppRouter extends Backbone.Marionette.AppRouter
        appRoutes:
            '': 'renderHome'
            'address/:municipality/:street_address_slug(/)': 'renderAddress'
        constructor: (options) ->
            @appModels = options.models
            @controller = options.controller

            refreshServices = =>
                ids = @appModels.selectedServices.pluck('id').join ','
                if ids.length
                    "unit/?service=#{ids}"
                else
                    if @appModels.selectedPosition.isSet()
                        @fragmentFunctions.selectPosition()
                    else
                        ""
            blank = => ""

            @fragmentFunctions =
                selectUnit: =>
                    id = @appModels.selectedUnits.first().id
                    "unit/#{id}/"
                search: =>
                    query = @appModels.searchState?.get 'input_query'
                    "search/?q=#{query}"
                selectPosition: =>
                    slug = @appModels.selectedPosition.value().slugifyAddress()
                    "address/#{slug}"
                addService: refreshServices
                removeService: refreshServices
                clearSelectedPosition: blank
                clearSelectedUnit: blank
                clearSearchResults: blank
                closeSearch: blank
                home: blank

            super options
            @route /^unit\/(.*?)$/, @renderUnit
            @route /^search\/(\?.*)/, @renderSearch

        _parseUrlQuery: (path) ->
            if path.match /^\?.*/
                keyValuePair = /([^=\/&?]+=[^=\/&?]+)/g
                keyValStrings = path.match keyValuePair
                _.object _(keyValStrings).map (s) => s.split '='
            else
                false

        _matchResourceUrl: (path) ->
            found = path.match /^([0-9]+)\/?$/
            if found
                id: found[1]
            else
                filters: @_parseUrlQuery path

        renderSearch: (path) ->
            parsedPath = @_matchResourceUrl path
            if parsedPath.filters?.q?
                @controller.search parsedPath.filters.q

        renderUnit: (path) ->
            parsedPath = @_matchResourceUrl path
            if 'id' of parsedPath
                def = $.Deferred()
                @controller.renderUnitById(parsedPath.id).done (unit) =>
                    def.resolve
                        afterMapInit: => @controller.selectUnit unit
                def.promise()
            else if parsedPath.filters?.service?
                @controller.renderUnitsByServices parsedPath.filters.service

        _getFragment: (commandString, parameters) ->
            @fragmentFunctions[commandString]?()

        navigateByCommand: (commandString, parameters) ->
            fragment = @_getFragment commandString
            if fragment? then @navigate fragment

        execute: (callback, args) ->
            # The map view must only be initialized once
            # the state encoded in the route URL has been
            # reconstructed. The state affects the map
            # centering, zoom, etc.
            callback?.apply(@, args)?.done (opts) ->
                makeMapView()
                opts?.afterMapInit?()
                tour.startTour()

    app.addInitializer (opts) ->

        window.debugAppModels = appModels
        appModels.services.fetch
            data:
                level: 0

        appControl = new AppControl appModels
        router = new AppRouter models: appModels, controller: appControl
        appControl.router = router

        COMMANDS = [
            "addService",
            "removeService",

            "selectUnit",
            "highlightUnit",
            "clearSelectedUnit",

            "selectPosition",
            "clearSelectedPosition",

            "selectEvent",
            "clearSelectedEvent",

            "setUnits",
            "setUnit",
            "clearUnits",
            "addUnitsWithinBoundingBoxes"

            "search",
            "clearSearchResults",
            "closeSearch",
        ]
        reportError = (position, command) ->
            e = appControl._verifyInvariants()
            if e
                message = "Invariant failed #{position} command #{command}: #{e.message}"
                console.log appModels
                e.message = message
                throw e

        commandInterceptor = (comm, parameters) ->
            appControl[comm].apply(appControl, parameters)?.done? =>
                unless parameters[0]?.navigate == false
                    router.navigateByCommand comm, parameters

        makeInterceptor = (comm) ->
            if DEBUG_STATE
                ->
                    console.log "COMMAND #{comm} CALLED"
                    commandInterceptor comm, arguments
                    console.log appModels
            else if VERIFY_INVARIANTS
                ->
                    console.log "COMMAND #{comm} CALLED"
                    reportError "before", comm
                    commandInterceptor comm, arguments
                    reportError "after", comm
            else
                ->
                    commandInterceptor comm, arguments

        for comm in COMMANDS
            @commands.setHandler comm, makeInterceptor(comm)

        navigation = new NavigationLayout
            serviceTreeCollection: appModels.services
            selectedServices: appModels.selectedServices
            searchResults: appModels.searchResults
            selectedUnits: appModels.selectedUnits
            selectedEvents: appModels.selectedEvents
            searchState: appModels.searchState
            route: appModels.route
            routingParameters: appModels.routingParameters
            userClickCoordinatePosition: appModels.userClickCoordinatePosition
            selectedPosition: appModels.selectedPosition

        @getRegion('navigation').show navigation
        @getRegion('landingLogo').show new titleViews.LandingTitleView
        @getRegion('logo').show new titleViews.TitleView

        personalisation = new PersonalisationView
        @getRegion('personalisation').show personalisation

        languageSelector = new LanguageSelectorView
            p13n: p13n
        @getRegion('languageSelector').show languageSelector

        serviceCart = new ServiceCartView
            collection: appModels.selectedServices
        @getRegion('serviceCart').show serviceCart

        # The colors are dependent on the currently selected services.
        @colorMatcher = new ColorMatcher appModels.selectedServices

        f = -> landingPage.clear()
        $('body').one "keydown", f
        $('body').one "click", f

        Backbone.history.start
            pushState: true
            root: appSettings.url_prefix

        # Prevent empty anchors from appending a '#' to the URL bar but
        # still allow external links to work.
        $('body').on 'click', 'a', (ev) ->
            target = $(ev.currentTarget)
            if not target.hasClass 'external-link'
                ev.preventDefault()

        @listenTo app.vent, 'site-title:change', setSiteTitle

    app.addRegions
        navigation: '#navigation-region'
        personalisation: '#personalisation'
        languageSelector: '#language-selector'
        serviceCart: '#service-cart'
        landingLogo: '#landing-logo'
        logo: '#persistent-logo'
        map: '#app-container'

    window.app = app

    isFrontPage = =>
        Backbone.history.fragment == ''

    # We wait for p13n/i18next to finish loading before firing up the UI
    $.when(p13n.deferred).done ->
        $('html').attr 'lang', p13n.getLanguage()
        app.start()
        if isFrontPage() and p13n.get('first_visit')
            $('body').addClass 'landing'
        $('#app-container').attr 'class', p13n.get('map_background_layer')
        p13n.setVisited()
        uservoice.init(p13n.getLanguage())
