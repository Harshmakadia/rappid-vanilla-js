/*! Rappid v2.4.0 - HTML5 Diagramming Framework - TRIAL VERSION

Copyright (c) 2015 client IO

 2019-03-27 


This Source Code Form is subject to the terms of the Rappid Trial License
, v. 2.0. If a copy of the Rappid License was not distributed with this
file, You can obtain one at http://jointjs.com/license/rappid_v2.txt
 or from the Rappid archive as was distributed by client IO. See the LICENSE file.*/


// @import jquery.js
// @import lodash.js
// @import backbone.js
// @import geometry.js
// @import vectorizer.js
// @import joint.clean.js
// @import joint.shapes.qad.js
// @import selection.js
// @import factory.js
// @import snippet.js

var app = app || {};
var qad = window.qad || {};

app.AppView = joint.mvc.View.extend({

    el: '#app',

    events: {
        'click #toolbar .add-question': 'addQuestion',
        'click #toolbar .add-answer': 'addAnswer',
        'click #toolbar .preview-dialog': 'previewDialog',
        'click #toolbar .code-snippet': 'showCodeSnippet',
        'click #toolbar .load-example': 'loadExample',
        'click #toolbar .clear': 'clear'
    },

    init: function() {

        this.initializePaper();
        this.initializeSelection();
        this.initializeHalo();
        this.initializeInlineTextEditor();
        this.initializeTooltips();

        this.loadExample();
    },

    initializeTooltips: function() {

        new joint.ui.Tooltip({
            rootTarget: '#paper',
            target: '.joint-element',
            content: _.bind(function(target) {

                var cell = this.paper.findView(target).model;

                var text = '- Double-click to edit text inline.';
                if (cell.get('type') === 'qad.Question') {
                    text += '<br/><br/>- Connect a port with another Question or an Answer.';
                }

                return  text;

            }, this),
            direction: 'right',
            right: '#paper',
            padding: 20
        });
    },

    initializeInlineTextEditor: function() {

        var cellViewUnderEdit;

        var closeEditor = _.bind(function() {

            if (this.textEditor) {
                this.textEditor.remove();
                // Re-enable dragging after inline editing.
                cellViewUnderEdit.setInteractivity(true);
                this.textEditor = cellViewUnderEdit = undefined;
            }
        }, this);

        this.paper.on('cell:pointerdblclick', function(cellView, evt) {

            // Clean up the old text editor if there was one.
            closeEditor();

            var vTarget = V(evt.target);
            var text;
            var cell = cellView.model;

            switch (cell.get('type')) {

                case 'qad.Question':

                    text = joint.ui.TextEditor.getTextElement(evt.target);
                    if (!text) {
                        break;
                    }
                    if (vTarget.hasClass('body') || V(text).hasClass('question-text')) {

                        text = cellView.$('.question-text')[0];
                        cellView.textEditPath = 'question';

                    } else if (V(text).hasClass('option-text')) {

                        cellView.textEditPath = 'options/' + _.findIndex(cell.get('options'), { id: V(text.parentNode).attr('option-id') }) + '/text';
                        cellView.optionId = V(text.parentNode).attr('option-id');

                    } else if (vTarget.hasClass('option-rect')) {

                        text = V(vTarget.node.parentNode).find('.option-text');
                        cellView.textEditPath = 'options/' + _.findIndex(cell.get('options'), { id: V(vTarget.node.parentNode).attr('option-id') }) + '/text';
                    }
                    break;

                case 'qad.Answer':
                    text = joint.ui.TextEditor.getTextElement(evt.target);
                    cellView.textEditPath = 'answer';
                    break;
            }

            if (text) {

                this.textEditor = new joint.ui.TextEditor({ text: text });
                this.textEditor.render(this.paper.el);

                this.textEditor.on('text:change', function(newText) {

                    var cell = cellViewUnderEdit.model;
                    // TODO: prop() changes options and so options are re-rendered
                    // (they are rendered dynamically).
                    // This means that the `text` SVG element passed to the ui.TextEditor
                    // no longer exists! An exception is thrown subsequently.
                    // What do we do here?
                    cell.prop(cellViewUnderEdit.textEditPath, newText);

                    // A temporary solution or the right one? We just
                    // replace the SVG text element of the textEditor options object with the new one
                    // that was dynamically created as a reaction on the `prop` change.
                    if (cellViewUnderEdit.optionId) {
                        this.textEditor.options.text = cellViewUnderEdit.$('.option.option-' + cellViewUnderEdit.optionId + ' .option-text')[0];
                    }

                }, this);

                cellViewUnderEdit = cellView;
                // Prevent dragging during inline editing.
                cellViewUnderEdit.setInteractivity(false);
            }
        }, this);

        $(document.body).on('click', _.bind(function(evt) {

            var text = joint.ui.TextEditor.getTextElement(evt.target);
            if (this.textEditor && !text) {
                closeEditor();
            }

        }, this));
    },

    initializeHalo: function() {

        this.paper.on('element:pointerup', function(elementView, evt) {

            var halo = new joint.ui.Halo({
                cellView: elementView,
                useModelGeometry: true,
                type: 'toolbar'
            });

            halo.removeHandle('resize')
                .removeHandle('rotate')
                .removeHandle('fork')
                .removeHandle('link')
                .render();

        }, this);
    },

    initializeSelection: function() {

        var paper = this.paper;
        var graph = this.graph;
        var selection = this.selection = new app.Selection;

        selection.on('add reset', function() {
            var cell = this.selection.first();
            if (cell) {
                this.status('Selection: ' + cell.get('type'));
            } else {
                this.status('Selection emptied.');
            }
        }, this);

        paper.on({
            'element:pointerup': function(elementView) {
                this.selection.reset([elementView.model]);
            },
            'blank:pointerdown': function() {
                this.selection.reset([]);
            }
        }, this);

        graph.on('remove', function() {
            this.selection.reset([]);
        }, this);

        new app.SelectionView({
            model: selection,
            paper: paper
        });

        document.body.addEventListener('keydown', _.bind(function(evt) {

            var code = evt.which || evt.keyCode;
            // Do not remove the element with backspace if we're in inline text editing.
            if ((code === 8 || code === 46) && !this.textEditor && !this.selection.isEmpty()) {
                this.selection.first().remove();
                this.selection.reset([]);
                return false;
            }

            return true;

        }, this), false);
    },

    initializePaper: function() {

        this.paper = new joint.dia.Paper({
            el: this.$('#paper'),
            width: 800,
            height: 600,
            gridSize: 10,
            snapLinks: {
                radius: 75
            },
            linkPinning: false,
            multiLinks: false,
            defaultLink: app.Factory.createLink(),
            validateConnection: function(cellViewS, magnetS, cellViewT, magnetT, end, linkView) {
                // Prevent linking from input ports.
                if (magnetS && magnetS.getAttribute('port-group') === 'in') return false;
                // Prevent linking from output ports to input ports within one element.
                if (cellViewS === cellViewT) return false;
                // Prevent linking to input ports.
                return (magnetT && magnetT.getAttribute('port-group') === 'in') || (cellViewS.model.get('type') === 'qad.Question' && cellViewT.model.get('type') === 'qad.Answer');
            },
            validateMagnet: function(cellView, magnet) {
                // Note that this is the default behaviour. Just showing it here for reference.
                return magnet.getAttribute('magnet') !== 'passive';
            }
        });

        this.graph = this.paper.model;
    },

    // Show a message in the statusbar.
    status: function(m) {
        this.$('#statusbar .message').text(m);
    },

    addQuestion: function() {

        app.Factory.createQuestion('Question').addTo(this.graph);
        this.status('Question added.');
    },

    addAnswer: function() {

        app.Factory.createAnswer('Answer').addTo(this.graph);
        this.status('Answer added.');
    },

    previewDialog: function() {

        var cell = this.selection.first();
        var dialogJSON = app.Factory.createDialogJSON(this.graph, cell);
        var $background = $('<div/>').addClass('background').on('click', function() {
            $('#preview').empty();
        });

        $('#preview')
            .empty()
            .append([
                $background,
                qad.renderDialog(dialogJSON)
            ])
            .show();
    },

    loadExample: function() {

        // this.graph.fromJSON({ 'cells':[{ 'type':'qad.Question','size':{ 'width':201.8984375,'height':125 },'position':{ 'x':45,'y':38 },'angle':0,'question':'Does the thing work?','options':[{ 'id':'yes','text':'Yes' },{ 'id':'no','text':'No' }],'id':'d849d917-8a43-4d51-9e99-291799c144db','z':1,'attrs':{ '.options':{ 'refY':45 },'.question-text':{ 'text':'Does the thing work?' },'.option-yes':{ 'transform':'translate(0, 0)','dynamic':true },'.option-yes .option-rect':{ 'height':30,'dynamic':true },'.option-yes .option-port .port-body':{ 'port':'yes','dynamic':true },'.option-yes .option-text':{ 'text':'Yes','dynamic':true },'.option-no':{ 'transform':'translate(0, 30)','dynamic':true },'.option-no .option-rect':{ 'height':30,'dynamic':true },'.option-no .option-port .port-body':{ 'port':'no','dynamic':true },'.option-no .option-text':{ 'text':'No','dynamic':true },'.inPorts>.port-in>.port-label':{ 'text':'In' },'.inPorts>.port-in>.port-body':{ 'port':{ 'id':'in','type':'in','label':'In' }},'.inPorts>.port-in':{ 'ref':'.body','ref-x':0.5 }}},{ 'type':'qad.Answer','size':{ 'width':223.796875,'height':66.8 },'inPorts':[{ 'id':'in','label':'In' }],'outPorts':[{ 'id':'yes','label':'Yes' },{ 'id':'no','label':'No' }],'position':{ 'x':464,'y':68 },'angle':0,'answer':'Don\'t mess about with it.','id':'4073e883-1cc6-46a5-b22d-688ca1934324','z':2,'attrs':{ 'text':{ 'text':'Don\'t mess about with it.' }}},{ 'type':'link','source':{ 'id':'d849d917-8a43-4d51-9e99-291799c144db','selector':'g:nth-child(1) g:nth-child(3) g:nth-child(1) g:nth-child(4) circle:nth-child(1)      ','port':'yes' },'target':{ 'id':'4073e883-1cc6-46a5-b22d-688ca1934324' },'router':{ 'name':'manhattan' },'connector':{ 'name':'rounded' },'id':'9d87214a-7b08-47ce-9aec-8e49ed7ae929','embeds':'','z':3,'attrs':{ '.marker-target':{ 'd':'M 10 0 L 0 5 L 10 10 z','fill':'#6a6c8a','stroke':'#6a6c8a' },'.connection':{ 'stroke':'#6a6c8a','strokeWidth':2 }}},{ 'type':'qad.Question','size':{ 'width':195.6484375,'height':125 },'position':{ 'x':55,'y':245 },'angle':0,'question':'Did you mess about with it?','options':[{ 'id':'yes','text':'Yes' },{ 'id':'no','text':'No' }],'id':'8ce3f820-54f0-41f0-a46c-1e4f57b5f91e','z':4,'attrs':{ '.options':{ 'refY':45 },'.question-text':{ 'text':'Did you mess about with it?' },'.option-yes':{ 'transform':'translate(0, 0)','dynamic':true },'.option-yes .option-rect':{ 'height':30,'dynamic':true },'.option-yes .option-port .port-body':{ 'port':'yes','dynamic':true },'.option-yes .option-text':{ 'text':'Yes','dynamic':true },'.option-no':{ 'transform':'translate(0, 30)','dynamic':true },'.option-no .option-rect':{ 'height':30,'dynamic':true },'.option-no .option-port .port-body':{ 'port':'no','dynamic':true },'.option-no .option-text':{ 'text':'No','dynamic':true },'.inPorts>.port-in>.port-label':{ 'text':'In' },'.inPorts>.port-in>.port-body':{ 'port':{ 'id':'in','type':'in','label':'In' }},'.inPorts>.port-in':{ 'ref':'.body','ref-x':0.5 }}},{ 'type':'qad.Answer','size':{ 'width':156.234375,'height':66.8 },'inPorts':[{ 'id':'in','label':'In' }],'outPorts':[{ 'id':'yes','label':'Yes' },{ 'id':'no','label':'No' }],'position':{ 'x':343,'y':203 },'angle':0,'answer':'Run away!','id':'7da45291-2535-4aa1-bb50-5cadd2b2fb91','z':5,'attrs':{ 'text':{ 'text':'Run away!' }}},{ 'type':'link','source':{ 'id':'8ce3f820-54f0-41f0-a46c-1e4f57b5f91e','selector':'g:nth-child(1) g:nth-child(3) g:nth-child(1) g:nth-child(4) circle:nth-child(1)      ','port':'yes' },'target':{ 'id':'7da45291-2535-4aa1-bb50-5cadd2b2fb91' },'router':{ 'name':'manhattan' },'connector':{ 'name':'rounded' },'id':'fd9f3367-79b9-4f69-b5b7-2bba012e53bb','embeds':'','z':6,'attrs':{ '.marker-target':{ 'd':'M 10 0 L 0 5 L 10 10 z','fill':'#6a6c8a','stroke':'#6a6c8a' },'.connection':{ 'stroke':'#6a6c8a','stroke-width':2 }}},{ 'type':'qad.Question','size':{ 'width':155.6171875,'height':125 },'position':{ 'x':238,'y':429 },'angle':0,'question':'Will you get screwed?','options':[{ 'id':'yes','text':'Yes' },{ 'id':'no','text':'No' }],'id':'fd3e0ab4-fd3a-4342-972b-3616e0c0a5cf','z':7,'attrs':{ '.options':{ 'refY':45 },'.question-text':{ 'text':'Will you get screwed?' },'.option-yes':{ 'transform':'translate(0, 0)','dynamic':true },'.option-yes .option-rect':{ 'height':30,'dynamic':true },'.option-yes .option-port .port-body':{ 'port':'yes','dynamic':true },'.option-yes .option-text':{ 'text':'Yes','dynamic':true },'.option-no':{ 'transform':'translate(0, 30)','dynamic':true },'.option-no .option-rect':{ 'height':30,'dynamic':true },'.option-no .option-port .port-body':{ 'port':'no','dynamic':true },'.option-no .option-text':{ 'text':'No','dynamic':true },'.inPorts>.port-in>.port-label':{ 'text':'In' },'.inPorts>.port-in>.port-body':{ 'port':{ 'id':'in','type':'in','label':'In' }},'.inPorts>.port-in':{ 'ref':'.body','ref-x':0.5 }}},{ 'type':'link','source':{ 'id':'d849d917-8a43-4d51-9e99-291799c144db','selector':'g:nth-child(1) g:nth-child(3) g:nth-child(2) g:nth-child(4) circle:nth-child(1)      ','port':'no' },'target':{ 'id':'8ce3f820-54f0-41f0-a46c-1e4f57b5f91e','selector':'g:nth-child(1) g:nth-child(4) g:nth-child(1) circle:nth-child(1)     ','port':'in' },'router':{ 'name':'manhattan' },'connector':{ 'name':'rounded' },'id':'641410b2-aeb5-42ad-b757-2d9c6e4d56bd','embeds':'','z':8,'attrs':{ '.marker-target':{ 'd':'M 10 0 L 0 5 L 10 10 z','fill':'#6a6c8a','stroke':'#6a6c8a' },'.connection':{ 'stroke':'#6a6c8a','stroke-width':2 }}},{ 'type':'link','source':{ 'id':'8ce3f820-54f0-41f0-a46c-1e4f57b5f91e','selector':'g:nth-child(1) g:nth-child(3) g:nth-child(2) g:nth-child(4) circle:nth-child(1)      ','port':'no' },'target':{ 'id':'fd3e0ab4-fd3a-4342-972b-3616e0c0a5cf','selector':'g:nth-child(1) g:nth-child(4) g:nth-child(1) circle:nth-child(1)     ','port':'in' },'router':{ 'name':'manhattan' },'connector':{ 'name':'rounded' },'id':'3b9de57d-be21-4e9e-a73b-693b32e5f14a','embeds':'','z':9,'attrs':{ '.marker-target':{ 'd':'M 10 0 L 0 5 L 10 10 z','fill':'#6a6c8a','stroke':'#6a6c8a' },'.connection':{ 'stroke':'#6a6c8a','stroke-width':2 }}},{ 'type':'qad.Answer','size':{ 'width':177.1953125,'height':66.8 },'inPorts':[{ 'id':'in','label':'In' }],'outPorts':[{ 'id':'yes','label':'Yes' },{ 'id':'no','label':'No' }],'position':{ 'x':545,'y':400 },'angle':0,'answer':'Poor boy.','id':'13402455-006d-41e3-aacc-514f551b78b8','z':10,'attrs':{ 'text':{ 'text':'Poor boy.' }}},{ 'type':'qad.Answer','size':{ 'width':146.9453125,'height':66.8 },'inPorts':[{ 'id':'in','label':'In' }],'outPorts':[{ 'id':'yes','label':'Yes' },{ 'id':'no','label':'No' }],'position':{ 'x':553,'y':524 },'angle':0,'answer':'Put it in a bin.','id':'857c9deb-86c3-47d8-bc6d-8f36c5294eab','z':11,'attrs':{ 'text':{ 'text':'Put it in a bin.' }}},{ 'type':'link','source':{ 'id':'fd3e0ab4-fd3a-4342-972b-3616e0c0a5cf','selector':'g:nth-child(1) g:nth-child(3) g:nth-child(1) g:nth-child(4) circle:nth-child(1)      ','port':'yes' },'target':{ 'id':'13402455-006d-41e3-aacc-514f551b78b8' },'router':{ 'name':'manhattan' },'connector':{ 'name':'rounded' },'id':'7e96039d-c3d4-4c86-b8e5-9a49835e114b','embeds':'','z':12,'attrs':{ '.marker-target':{ 'd':'M 10 0 L 0 5 L 10 10 z','fill':'#6a6c8a','stroke':'#6a6c8a' },'.connection':{ 'stroke':'#6a6c8a','stroke-width':2 }}},{ 'type':'link','source':{ 'id':'fd3e0ab4-fd3a-4342-972b-3616e0c0a5cf','selector':'g:nth-child(1) g:nth-child(3) g:nth-child(2) g:nth-child(4) circle:nth-child(1)      ','port':'no' },'target':{ 'id':'857c9deb-86c3-47d8-bc6d-8f36c5294eab' },'router':{ 'name':'manhattan' },'connector':{ 'name':'rounded' },'id':'eecaae21-3e81-43f9-a5c1-6ea40c1adba8','embeds':'','z':13,'attrs':{ '.marker-target':{ 'd':'M 10 0 L 0 5 L 10 10 z','fill':'#6a6c8a','stroke':'#6a6c8a' },'.connection':{ 'stroke':'#6a6c8a','stroke-width':2 }}}] });
        this.graph.fromJSON({ 'cells':[] });
    },

    clear: function() {

        this.graph.clear();
    },

    showCodeSnippet: function() {

        var cell = this.selection.first();
        var dialogJSON = app.Factory.createDialogJSON(this.graph, cell);

        var id = _.uniqueId('qad-dialog-');

        var snippet = '';
        snippet += '<div id="' + id + '"></div>';
        snippet += '<link rel="stylesheet" type="text/css" href="http://qad.client.io/css/snippet.css"></script>';
        snippet += '<script type="text/javascript" src="http://qad.client.io/src/snippet.js"></script>';
        snippet += '<script type="text/javascript">';
        snippet += 'document.getElementById("' + id + '").appendChild(qad.renderDialog(' + JSON.stringify(dialogJSON) + '))';
        snippet += '</script>';

        var content = '<textarea>' + snippet + '</textarea>';

        var dialog = new joint.ui.Dialog({
            width: '50%',
            height: 200,
            draggable: true,
            title: 'Copy-paste this snippet to your HTML page.',
            content: content
        });

        dialog.open();
    }
});
