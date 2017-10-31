define (require) ->
    URI  = require 'URI'

    p13n = require 'app/p13n'
    jade = require 'app/jade'
    base = require 'app/views/base'

    class TitleView extends base.SMItemView
        initialize: ({href: @href}) ->
        className:
            'title-control'
        render: =>
            @el.innerHTML = jade.template 'embedded-title', lang: p13n.getLanguage(), href: @href
            @el
