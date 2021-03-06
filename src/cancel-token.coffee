define (require) ->
    Backbone = require 'backbone'

    class CancelToken extends Backbone.Model
        initialize: ->
            @handlers = []
            @set 'active', false
            @set 'canceled', false
            @set 'cancelable', true
            @local = false
        addHandler: (fn) ->
            @handlers.push fn
        activate: (opts) ->
            if opts?.local then @local = true
            @set 'active', true, opts
            @trigger 'activated'
        cancel: ->
            @set 'canceled', true
            @set 'status', 'canceled'
            @trigger 'canceled'
            i = @handlers.length - 1
            while i > -1
                @handlers[i--]()
            undefined
        complete: ->
            @set 'active', false
            @set 'complete', true
            @trigger 'complete'
        canceled: ->
            @get 'canceled'
