define (require) ->
    base = require 'app/views/base'

    class FeedbackConfirmationView extends base.SMItemView
        template: 'feedback-confirmation'
        className: 'content modal-dialog'
        events:
            'click .ok-button': '_close'
        initialize: (@unit) ->
        serializeData: ->
            if @unit?.toJSON?
                unit = @unit.toJSON()
            else
                unit = {}
            unit: unit
        _close: ->
            app.request 'closeFeedback'
