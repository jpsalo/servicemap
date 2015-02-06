define [
    'underscore',
    'app/p13n',
    'app/views/base',
], (
    _,
    p13n,
    base
)  ->

    class ServiceCartView extends base.SMItemView
        template: 'service-cart'
        tagName: 'ul'
        className: 'expanded container'
        events:
            'click .personalisation-container .maximizer': 'maximize'
            'click .button.cart-close-button': 'minimize'
            'click .button.close-button': 'closeService'
            'click input.unselected': 'selectLayerInput'
            'click label.unselected': 'selectLayerLabel'
        initialize: (opts) ->
            @collection = opts.collection
            @listenTo @collection, 'add', @maximize
            @listenTo @collection, 'remove', =>
                if @collection.length
                    @render()
                else
                    @minimize()
            @listenTo @collection, 'reset', @render
            @listenTo @collection, 'minmax', @render
            if @collection.length
                @minimized = false
            else
                @minimized = true
        maximize: ->
            @minimized = false
            @collection.trigger 'minmax'
        minimize: ->
            @minimized = true
            @collection.trigger 'minmax'
        onRender: ->
            if @minimized
                @$el.removeClass 'expanded'
                @$el.addClass 'minimized'
            else
                @$el.addClass 'expanded'
                @$el.removeClass 'minimized'
        serializeData: ->
            if @minimized
                return minimized: true
            data = super()
            data.layers = p13n.getMapBackgroundLayers()
            data
        closeService: (ev) ->
            app.commands.execute 'removeService', $(ev.currentTarget).data('service')
        otherLayer: ->
            layer = _.find ['servicemap', 'guidemap'],
                (l) => l != p13n.get('map_background_layer')
        switchMap: (ev) ->
            p13n.setMapBackgroundLayer @otherLayer()
        _selectLayer: (value) ->
            p13n.setMapBackgroundLayer value
        selectLayerInput: (ev) ->
            @_selectLayer $(ev.currentTarget).attr('value')
        selectLayerLabel: (ev) ->
            @_selectLayer $(ev.currentTarget).data('layer')