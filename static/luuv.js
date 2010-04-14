/*
 * Switches between different views of the application when the hash
 * tag changes, using the HTML5 hashchange event.
 */
jQuery(window).bind('hashchange', function () {
    jQuery('.nav-selected').removeClass('nav-selected');

    var hash = window.location.hash.substr(1);
    switch (hash) {
    case "home":
        jQuery('#nav-home').addClass('nav-selected');
        getMyLuuvs();
        break;
    case "latest":
        jQuery('#nav-latest').addClass('nav-selected');
        getLatestLuuvs();
        break;
    default:
        getUserLuuvs(hash);
    }
});
// Trigger initial event when the page loads
jQuery(window).trigger('hashchange');


/*
 * Search Wikipedia for things to luuv using JSONP.
 */
function WikipediaSearch () {

    var delay = 500;
    var timeout;

    jQuery('#search').show();

    jQuery('#query').keypress(function (event) {
        clearTimeout(timeout);
        timeout = setTimeout(doSearch, delay);
    });

    jQuery('#search-clear-button').click(function () {
        jQuery('#results').slideUp(
            'slow', function () {jQuery(this).empty();});
        jQuery('#query').attr('value', '').focus();
    });

    function doSearch () {
        var query = jQuery.trim(jQuery('#query').val());
        if (!query) {
            jQuery('#results').slideUp(
                'slow', function () {jQuery(this).empty();});
            return;
        }

        jQuery('#results').show();
        var searching = jQuery('#searching-template').clone();
        searching.appendTo('#results');
        searching.find('.search-term').text(query);

        var url = "http://en.wikipedia.org/w/api.php";
        var parameters = {
            format: "json",
            action: "query",
            list: "search",
            srlimit: 3,
            srwhat: "text",
            srsearch: query
        };

        jQuery.ajax({
            type: "GET",
            url: url,
            data: parameters,
            dataType: "jsonp",
            onerror: function onerror () { /*XXX*/},
            success: process
        });
    }

    function process (data, textStatus, xhr) {
        jQuery('#results').empty();
        if (!data || !data.query || !data.query.search) {
            onerror();
            return;
        }
        jQuery.each(data.query.search, function (i) {
            // 'this' is the current item in the sequence
            var node = renderItem({what: this.title, when: '', who: ''},
                                  'result-template');
            node.appendTo('#results');
        });
    }
}

/*
 * Fetch title, summary, and primary image for a Wikipedia article
 * identified by 'title'.
 * 
 * Caches the retrieved data in the browser's localStorage (HTML5) if
 * available.  TODO we should store the 'revid' for an article
 * somewhere to check whether the article info needs updating...
 * 
 * Calls 'callback' with data object once data is available.
 */
var LUUV_LS_FORMAT = 0;
function fetchArticleInfo (title, callback) {
    // Retrieve from local storage cache if availble
    if (localStorage && localStorage[title]) {
        callback(JSON.parse(localStorage[title]));
        return;
    }

    var url = "http://en.wikipedia.org/w/api.php";
    var parameters = {
        format: "json",
        action: "parse",
        page: title
    };

    // This is largely inspired by the 'wikipedia' command in Ubiquity.
    function process (data, textStatus, xhr) {
        var parse = jQuery("<div>" + data.parse.text["*"]);
        var summary = parse.find("p:first").text();

        // remove citations [3], [citation needed], etc.
        summary = summary.replace(/\[.+?\]/g, "");

        var image = (parse.find(".infobox img").attr("src") ||
                     parse.find(".thumbimage") .attr("src") || "");

        var info = {title: title,
                    summary: summary,
                    image: image,
                    revid: data.parse.revid,
                    format: LUUV_LS_FORMAT};
        if (localStorage) {
            localStorage[title] = JSON.stringify(info);
        }
        callback(info);
    }

    jQuery.ajax({
        type: "GET",
        url: url,
        data: parameters,
        dataType: "jsonp",
        onerror: function () {/*XXX*/},
        success: process
    });
}


/*
 * Render a luuv item based on a template that's available in the DOM.
 * Not all placeholders will be present in all templates, but that's ok.
 */
function renderItem(item, template_id) {
    var id = titleToId(item.what);
    var node = jQuery('#' + template_id).clone(); // TODO escape id
    var url = "http://en.wikipedia.org/wiki/" + id;
    node.attr('id', 'luuv-' + id);
    node.find('.luuv-title').text(item.what).click(function (event) {
        event.preventDefault();
        node.find('.item-secondrow').slideToggle();
    });
    node.find('.luuv-morelink').attr('href', url);
    node.find('.luuv-user')
        .html('<a href="#' + item.who + '">' + item.who + '</a>');
    node.find('.luuv-when').attr('datetime', item.when)
        .text(item.when).timeago();

    node.find('.luuv-button').click(function () {
        doLuuv(item.what);
    });
    node.find('.unluuv-button').click(function () {
        doUnluuv(item.what);
    });

    fetchArticleInfo(item.what, function (info) {
        node.find('.luuv-summary').text(info.summary);
        node.find('.luuv-img').attr('src', info.image);
    });

    node.show();
    return node;
}

function titleToId(title) {
    return title.replace(/[ ]/g, '_');
}



/*** AJAX calls to our server ***/

function doLuuv (what) {
    jQuery('#query').attr('value', '');
    jQuery('#results').slideUp('slow');

    function process (data, textStatus, xhr) {
        if (!data.new_luuv) {
            //XXX
            return;
        }

        var node = renderItem(data.new_luuv, 'my-luuv-template');
        node.prependTo('#luuvs');
    }

    jQuery.ajax({
        type: "POST",
        url: "/do_luuv",
        data: {what: what},
        onerror: function () {/*XXX*/},
        success: process
    });
}

function doUnluuv (what) {
    function process (data, textStatus, xhr) {
        if (!data.del_luuv) {
            //XXX
            return;
        }

        var node = jQuery('#luuv-' + titleToId(data.del_luuv.what));
        node.slideUp('slow', function () {node.remove();});
    }

    jQuery.ajax({
        type: "POST",
        url: "/do_unluuv",
        data: {what: what},
        onerror: function () {/*XXX*/},
        success: process
    });
}

function getMyLuuvs() {
    jQuery('#search').show();
    jQuery('#luuvs').empty();
    jQuery('#loading-template').clone().appendTo('#luuvs');
    jQuery('#luuv-things-heading').text('Things you luuv');

    function process (data, textStatus, xhr) {
        if (!data.luuvs) {
            //XXX
            return;
        }

        jQuery('#luuvs').empty();
        jQuery.each(data.luuvs, function (i) {
            // 'this' is the current item in the sequence
            var node = renderItem(this, 'my-luuv-template');
            node.appendTo('#luuvs');
        });
    }

    jQuery.ajax({
        type: "GET",
        url: "/get_my_luuvs",
        onerror: function () {/*XXX*/},
        success: process
    });
}

function getLatestLuuvs() {
    jQuery('#search').hide();
    jQuery('#luuvs').empty();
    jQuery('#loading-template').clone().appendTo('#luuvs');
    jQuery('#luuv-things-heading').text('Latest luuvs');

    function process (data, textStatus, xhr) {
        if (!data.luuvs) {
            //XXX
            return;
        }

        jQuery('#luuvs').empty();
        jQuery.each(data.luuvs, function (i) {
            // 'this' is the current item in the sequence
            var node = renderItem(this, 'latest-luuv-template');
            node.appendTo('#luuvs');
        });
    }

    jQuery.ajax({
        type: "GET",
        url: "/get_latest_luuvs",
        onerror: function () {/*XXX*/},
        success: process
    });
}

function getUserLuuvs(who) {
    if (!who) {
        return;
    }

    jQuery('#search').hide();
    jQuery('#luuvs').empty();
    jQuery('#loading-template').clone().appendTo('#luuvs');
    jQuery('#luuv-things-heading').text('Things ' + who + ' luuvs');

    function process (data, textStatus, xhr) {
        if (!data.luuvs) {
            //XXX
            return;
        }

        jQuery('#luuvs').empty();
        jQuery.each(data.luuvs, function (i) {
            // 'this' is the current item in the sequence
            var node = renderItem(this, 'user-luuv-template');
            node.appendTo('#luuvs');
        });
    }

    jQuery.ajax({
        type: "GET",
        url: "/get_user_luuvs",
        data: {who: who},
        onerror: function () {/*XXX*/},
        success: process
    });
}
