define (require) ->
    base = require 'app/views/base'

    class LocationRefreshButtonView extends base.SMLayout
        template: 'location-refresh-button'
        events:
            'click': 'resetPosition'
        resetPosition: (ev) ->
            ev.stopPropagation()
            ev.preventDefault()
            app.request 'resetPosition', null
        render: ->
            super()
            @el
