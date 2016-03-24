define [
    'backbone.marionette',
    'cs!app/jade',
    'cs!app/base',
    'cs!app/util/navigation',
], (
    Marionette,
    jade,
    {mixOf: mixOf},
    NavigationUtils
) ->
    class SMTemplateMixin
        mixinTemplateHelpers: (data) ->
            jade.mixinHelpers data
            return data
        getTemplate: ->
            return jade.getTemplate @template

    class KeyboardHandlerMixin
        keyboardHandler: (callback, keys) =>
            codes = _(keys).map (key) =>
                switch key
                    when 'enter' then 13
                    when 'space' then 32
            handle = _.bind(callback, @)
            (event) =>
                event.stopPropagation()
                if event.which in codes then handle event

    class ToggleMixin
        toggleCollapse: (ev) ->
            ev.preventDefault()
            @collapsed = !@collapsed
            @render()
            @setMaxHeight()
            unless @collapsed
                NavigationUtils.checkLocationHash()

        setMaxHeight: ->
            $limitedElement = @$el.find('.limit-max-height')
            return unless $limitedElement.length
            maxHeight = $(window).innerHeight() - $limitedElement.offset().top
            $limitedElement.css 'max-height': maxHeight

        handleCollapsedState: ->
            if @collapsed
                @$el.find('#details-view-container').hide()
            else
                @$el.find('#details-view-container').show()
            event = if @collapsed then 'maximize' else 'minimize'
            app.vent.trigger "mapview-activearea:#{event}"

    class SMLayout extends mixOf(
        Marionette.Layout,
        SMTemplateMixin,
        KeyboardHandlerMixin,
        ToggleMixin
    )

    DETAILS_BODY_CLASS = 'details-view'

    class DetailsLayout extends SMLayout
        addBodyClass: ->
            $('body').toggleClass DETAILS_BODY_CLASS, true
        removeBodyClass: ->
            $('body').toggleClass DETAILS_BODY_CLASS, false
        onClose: ->
            @removeBodyClass()
        isMobile: ->
            $(window).width() <= appSettings.mobile_ui_breakpoint
        alignToBottom: (callback) ->
            $limitedElement = @$el.find '.content'
            if @isMobile()
                # Set the sidebar content max height for proper scrolling.
                delta = @$el.find('.limit-max-height').height() - $limitedElement.outerHeight()
                if delta > 0
                    _.defer =>
                        currentPadding = Number.parseFloat $limitedElement.css('padding-top')
                        return if Number.isNaN currentPadding
                        $limitedElement.css 'padding-top', "#{delta + currentPadding}px"
            _.defer =>
                $limitedElement.css 'visibility', 'visible'
                callback?()

    return {
        SMItemView: class SMItemView extends mixOf(
            Marionette.ItemView,
            SMTemplateMixin,
            KeyboardHandlerMixin
        )
        SMCollectionView: class SMCollectionView extends mixOf(
            Marionette.CollectionView,
            SMTemplateMixin,
            KeyboardHandlerMixin
        )
        SMLayout: SMLayout
        DetailsLayout: DetailsLayout
    }
