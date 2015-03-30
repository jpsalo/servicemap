define [
    'underscore',
    'i18next',
    'app/models',
    'app/views/base',
    'app/spinner'
], (
    _,
    i18n,
    models,
    base,
    SMSpinner
) ->

    EXPAND_CUTOFF = 3
    PAGE_SIZE = 20

    isElementInViewport = (el) ->
      if typeof jQuery == 'function' and el instanceof jQuery
        el = el[0]
      rect = el.getBoundingClientRect()
      return rect.bottom <= (window.innerHeight or document.documentElement.clientHeight) + (el.offsetHeight * 0)


    class SearchResultView extends base.SMItemView
        template: 'search-result'
        tagName: 'li'
        events:
            'click': 'selectResult'
            'mouseenter': 'highlightResult'

        selectResult: (ev) ->
            if @model.get('object_type') == 'unit'
                app.commands.execute 'selectUnit', @model
            else if @model.get('object_type') == 'service'
                app.commands.execute 'addService', @model

        highlightResult: (ev) ->
            app.commands.execute 'highlightUnit', @model

        serializeData: ->
            data = super()
            data.specifier_text = @model.getSpecifierText()
            data

    class SearchResultsView extends base.SMCollectionView
        tagName: 'ul'
        className: 'main-list'
        itemView: SearchResultView
        initialize: (opts) ->
            super(opts)
            @parent = opts.parent

    class SearchResultsLayoutView extends base.SMLayout
        template: 'search-results'
        regions:
            results: '.result-contents'
        className: 'search-results-container'
        events:
            'click .back-button': 'goBack'

        goBack: (ev) ->
            @expansion = EXPAND_CUTOFF
            @requestedExpansion = 0
            @parent.render()

        onBeforeRender: ->
            @collection = new @fullCollection.constructor @fullCollection.slice(0, @expansion)

        nextPage: (ev) ->
            if @expansion == EXPAND_CUTOFF
                newExpansion = PAGE_SIZE
            else
                newExpansion = @expansion + PAGE_SIZE
            if @requestedExpansion == newExpansion
                return
            @requestedExpansion = newExpansion
            fields = @getDetailedFieldset()
            @fullCollection.fetchFields(@requestedExpansion - PAGE_SIZE, @requestedExpansion, fields).done =>
                    @expansion = @requestedExpansion
                    @render()

        getDetailedFieldset: ->
            if @resultType == 'service_point'
                ['services']
            else
                ['ancestors']

        initialize: (opts) ->
            @expansion = EXPAND_CUTOFF
            @fullCollection = opts.fullCollection
            @resultType = opts.resultType
            @parent = opts.parent
            @$more = null
            @requestedExpansion = 0
            fields = @getDetailedFieldset()
            @ready = false
            @fullCollection.fetchFields(0, EXPAND_CUTOFF, fields).done =>
                @ready = true
                @render()
            @listenTo @fullCollection, 'hide', =>
                @hidden = true
                @render()
            @listenTo @fullCollection, 'show-all', @nextPage
        serializeData: ->
            if @hidden
                return hidden: true

            data = super()
            if @collection.length
                data =
                    target: @resultType
                    expanded: @_expanded()
                    showAll: false
                    showMore: false
                    header: i18n.t("sidebar.search_#{@resultType}_count", count: @fullCollection.length)
                if @fullCollection.length > EXPAND_CUTOFF and !@_expanded()
                    data.showAll = i18n.t "sidebar.search_#{@resultType}_show_all",
                        count: @fullCollection.length
                else if @fullCollection.length > @expansion
                    data.showMore = true
            data

        onRender: ->
            unless @ready
                return
            collectionView = new SearchResultsView
                collection: @collection
                parent: @
            @listenTo collectionView, 'collection:rendered', =>
                _.defer => @$more = $(@el).find '.show-more'
            @results.show collectionView

        tryNextPage: ->
            if @$more?.length
                if isElementInViewport @$more
                    @$more.find('.text-content').html i18n.t('accessibility.pending')
                    spinner = new SMSpinner
                        container: @$more.find('.spinner-container').get(0),
                        radius: 5,
                        length: 3,
                        lines: 12,
                        width: 2,
                    spinner.start()
                    @nextPage()

        _expanded: ->
            @expansion > EXPAND_CUTOFF

    class SearchLayoutView extends base.SMLayout
        className: 'search-results navigation-element limit-max-height'
        template: 'search-layout'
        regions:
            servicePointResultsRegion: '.service-points'
            categoryResultsRegion: '.categories'
        type: 'search'
        events:
            'click .show-all': 'showAll'
            'scroll': 'tryNextPage'
        tryNextPage: ->
            @servicePointResults?.tryNextPage()
        showAll: (ev) ->
            ev?.preventDefault()
            targetView = $(ev.currentTarget).data 'target'
            targetCollection = null
            switch targetView
                when 'category'
                    targetCollection = @categoryCollection
                    otherCollection = @servicePointCollection
                when 'service_point'
                    targetCollection = @servicePointCollection
                    otherCollection = @categoryCollection
            otherCollection.trigger 'hide'
            targetCollection.trigger 'show-all'

        initialize: ->
            @categoryCollection = new models.ServiceList()
            @servicePointCollection = new models.UnitList()
            @listenTo @collection, 'hide', => @$el.hide()
            @listenTo @collection, 'ready', @render

        serializeData: ->
            data = super()
            @categoryCollection.set @collection.where(object_type: 'service')
            @servicePointCollection.set @collection.where(object_type: 'unit')
            unless @collection.length
                if @collection.query
                    data.noResults = true
                    data.query = @collection.query
            data

        onRender: ->
            @$el.show()
            if @categoryCollection.length
                @categoryResults = new SearchResultsLayoutView
                    resultType: 'category'
                    fullCollection: @categoryCollection
                    parent: @
                @categoryResultsRegion.show @categoryResults
            if @servicePointCollection.length
                @servicePointResults = new SearchResultsLayoutView
                    resultType: 'service_point'
                    fullCollection: @servicePointCollection
                    parent: @
                @servicePointResultsRegion.show @servicePointResults


    SearchLayoutView

