import Component from 'flarum/component';
import ItemList from 'flarum/utils/item-list';
import DiscussionList from 'flarum/components/discussion-list';
import DiscussionHero from 'flarum/components/discussion-hero';
import PostStream from 'flarum/components/post-stream';
import PostScrubber from 'flarum/components/post-scrubber';
import ReplyComposer from 'flarum/components/reply-composer';
import ActionButton from 'flarum/components/action-button';
import LoadingIndicator from 'flarum/components/loading-indicator';
import DropdownSplit from 'flarum/components/dropdown-split';
import Separator from 'flarum/components/separator';
import listItems from 'flarum/helpers/list-items';
import mixin from 'flarum/utils/mixin';
import evented from 'flarum/utils/evented';

export default class DiscussionPage extends mixin(Component, evented) {
  /**

   */
  constructor(props) {
    super(props);

    this.discussion = m.prop();
    this.refresh();

    if (app.cache.discussionList) {
      if (app.current instanceof DiscussionPage) {
        m.redraw.strategy('diff'); // otherwise pane redraws (killing retained subtrees) and mouseenter event is triggered so it doesn't hide
      }
      app.pane.enable();
      app.pane.hide();
    }

    app.history.push('discussion');
    app.current = this;
    app.session.on('loggedIn', this.loggedInHandler = this.refresh.bind(this));
  }

  refresh() {
    this.currentNear = m.route.param('near') || 0;
    this.discussion(null);

    var params = this.params();
    params.include = params.include.join(',');

    const discussion = app.preloadedDocument();
    if (discussion) {
      // We must wrap this in a setTimeout because if we are mounting this
      // component for the first time on page load, then any calls to m.redraw
      // will be ineffective and thus any configs (scroll code) will be run
      // before stuff is drawn to the page.
      setTimeout(this.setupDiscussion.bind(this, discussion));
    } else {
      app.store.find('discussions', m.route.param('id'), params).then(this.setupDiscussion.bind(this));
    }

    // Trigger a redraw only if we're not already in a computation (e.g. route change)
    m.startComputation();
    m.endComputation();
  }

  params() {
    return {
      page: {near: this.currentNear},
      include: ['posts', 'posts.user', 'posts.user.groups']
    };
  }

  /*

   */
  setupDiscussion(discussion) {
    // Hold up there skippy! If the slug in the URL doesn't match up, we'll
    // redirect so we have the correct one.
    // Waiting on https://github.com/lhorie/mithril.js/issues/539
    // if (m.route.param('id') === discussion.id() && m.route.param('slug') !== discussion.slug()) {
    //   var params = m.route.param();
    //   params.slug = discussion.slug();
    //   params.near = params.near || '';
    //   m.route(app.route('discussion.near', params), null, true);
    //   return;
    // }

    this.discussion(discussion);
    app.setTitle(discussion.title());

    var includedPosts = [];
    if (discussion.payload && discussion.payload.included) {
      discussion.payload.included.forEach(record => {
        if (record.type === 'posts' && record.relationships && record.relationships.discussion) {
          includedPosts.push(app.store.getById('posts', record.id));
        }
      });
      includedPosts.sort((a, b) => a.id() - b.id()).splice(20);
    }

    this.stream = new PostStream({ discussion, includedPosts });
    this.stream.on('positionChanged', this.positionChanged.bind(this));
    this.stream.goToNumber(m.route.param('near') || 1, true);

    this.trigger('loaded', discussion);
  }

  onload(element, isInitialized, context) {
    if (isInitialized) { return; }

    context.retain = true;

    $('body').addClass('discussion-page');
    context.onunload = function() {
      $('body').removeClass('discussion-page');
    }
  }

  /**

   */
  onunload(e) {
    // If we have routed to the same discussion as we were viewing previously,
    // cancel the unloading of this controller and instead prompt the post
    // stream to jump to the new 'near' param.
    var discussion = this.discussion();
    if (discussion) {
      if (m.route.param('id') == discussion.id()) {
        e.preventDefault();
        if (m.route.param('near') != this.currentNear) {
          this.stream.goToNumber(m.route.param('near') || 1);
        }
        this.currentNear = null;
        return;
      }
    }

    app.pane.disable();
    app.session.off('loggedIn', this.loggedInHandler);

    if (app.composingReplyTo(discussion) && !app.composer.component.content()) {
      app.composer.hide();
    } else {
      app.composer.minimize();
    }
  }

  /**

   */
  view() {
    var discussion = this.discussion();

    return m('div', {config: this.onload.bind(this)}, [
      app.cache.discussionList ? m('div.index-area.paned', {config: this.configIndex.bind(this)}, app.cache.discussionList.render()) : '',
      m('div.discussion-area', discussion ? [
        DiscussionHero.component({discussion}),
        m('div.container', [
          m('nav.discussion-nav', [
            m('ul', listItems(this.sidebarItems().toArray()))
          ]),
          this.stream.render()
        ])
      ] : LoadingIndicator.component({className: 'loading-indicator-block'}))
    ]);
  }

  /**

   */
  configIndex(element, isInitialized, context) {
    if (isInitialized) { return; }

    context.retain = true;

    var $index = $(element);

    // When viewing a discussion (for which the discussions route is the
    // parent,) the discussion list is still rendered but it becomes a
    // pane hidden on the side of the screen. When the mouse enters and
    // leaves the discussions pane, we want to show and hide the pane
    // respectively. We also create a 10px 'hot edge' on the left of the
    // screen to activate the pane.
    var pane = app.pane;
    $index.hover(pane.show.bind(pane), pane.onmouseleave.bind(pane));

    var hotEdge = function(e) {
      if (e.pageX < 10) { pane.show(); }
    };
    $(document).on('mousemove', hotEdge);
    context.onunload = function() {
      $(document).off('mousemove', hotEdge);
    };

    var $discussion = $index.find('.discussion-summary.active');
    if ($discussion.length) {
      var indexTop = $index.offset().top;
      var discussionTop = $discussion.offset().top;
      if (discussionTop < indexTop || discussionTop + $discussion.outerHeight() > indexTop + $index.outerHeight()) {
        $index.scrollTop($index.scrollTop() - indexTop + discussionTop);
      }
    }
  }

  /**

   */
  sidebarItems() {
    var items = new ItemList();

    items.add('controls',
      DropdownSplit.component({
        items: this.discussion().controls(this).toArray(),
        icon: 'ellipsis-v',
        className: 'primary-control',
        buttonClass: 'btn btn-primary'
      })
    );

    items.add('scrubber',
      PostScrubber.component({
        stream: this.stream,
        className: 'title-control'
      })
    );

    return items;
  }

  /**

   */
  positionChanged(startNumber, endNumber) {
    var discussion = this.discussion();

    var url = app.route('discussion.near', {
      id: discussion.id(),
      slug: discussion.slug(),
      near: this.currentNear = startNumber
    });

    // https://github.com/lhorie/mithril.js/issues/559
    m.route(url, true);
    window.history.replaceState(null, document.title, (m.route.mode === 'hash' ? '#' : '')+url);

    app.history.push('discussion');

    if (app.session.user() && endNumber > (discussion.readNumber() || 0)) {
      discussion.save({readNumber: endNumber});
      m.redraw();
    }
  }
}
