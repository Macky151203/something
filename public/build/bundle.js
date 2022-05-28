
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.48.0' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* src\App.svelte generated by Svelte v3.48.0 */

    const file = "src\\App.svelte";

    function create_fragment(ctx) {
    	let main;
    	let div2;
    	let div1;
    	let div0;
    	let t0;
    	let div9;
    	let div8;
    	let div3;
    	let t2;
    	let div7;
    	let div4;
    	let span0;
    	let t4;
    	let div5;
    	let span1;
    	let t6;
    	let div6;
    	let span2;
    	let t8;
    	let div10;
    	let h20;
    	let t10;
    	let div16;
    	let div15;
    	let div11;
    	let t11;
    	let div12;
    	let t12;
    	let div13;
    	let t13;
    	let div14;
    	let t14;
    	let div22;
    	let div21;
    	let div17;
    	let t15;
    	let div18;
    	let t16;
    	let div19;
    	let t17;
    	let div20;
    	let t18;
    	let div23;
    	let h21;
    	let t20;
    	let div29;
    	let div28;
    	let div24;
    	let t21;
    	let div25;
    	let t22;
    	let div26;
    	let t23;
    	let div27;
    	let t24;
    	let div41;
    	let div40;
    	let div36;
    	let div30;
    	let t26;
    	let div35;
    	let div31;
    	let t27;
    	let div32;
    	let t28;
    	let div33;
    	let t29;
    	let div34;
    	let t30;
    	let div37;
    	let t31;
    	let div38;
    	let t32;
    	let div39;

    	const block = {
    		c: function create() {
    			main = element("main");
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div9 = element("div");
    			div8 = element("div");
    			div3 = element("div");
    			div3.textContent = "I em";
    			t2 = space();
    			div7 = element("div");
    			div4 = element("div");
    			span0 = element("span");
    			span0.textContent = "Get access to...";
    			t4 = space();
    			div5 = element("div");
    			span1 = element("span");
    			span1.textContent = "Notes, Uniform...";
    			t6 = space();
    			div6 = element("div");
    			span2 = element("span");
    			span2.textContent = "And Stationery...";
    			t8 = space();
    			div10 = element("div");
    			h20 = element("h2");
    			h20.textContent = "FEATURED PRODUCTS";
    			t10 = space();
    			div16 = element("div");
    			div15 = element("div");
    			div11 = element("div");
    			t11 = space();
    			div12 = element("div");
    			t12 = space();
    			div13 = element("div");
    			t13 = space();
    			div14 = element("div");
    			t14 = space();
    			div22 = element("div");
    			div21 = element("div");
    			div17 = element("div");
    			t15 = space();
    			div18 = element("div");
    			t16 = space();
    			div19 = element("div");
    			t17 = space();
    			div20 = element("div");
    			t18 = space();
    			div23 = element("div");
    			h21 = element("h2");
    			h21.textContent = "TRENDING PRODUCTS";
    			t20 = space();
    			div29 = element("div");
    			div28 = element("div");
    			div24 = element("div");
    			t21 = space();
    			div25 = element("div");
    			t22 = space();
    			div26 = element("div");
    			t23 = space();
    			div27 = element("div");
    			t24 = space();
    			div41 = element("div");
    			div40 = element("div");
    			div36 = element("div");
    			div30 = element("div");
    			div30.textContent = "LOGO";
    			t26 = space();
    			div35 = element("div");
    			div31 = element("div");
    			t27 = space();
    			div32 = element("div");
    			t28 = space();
    			div33 = element("div");
    			t29 = space();
    			div34 = element("div");
    			t30 = space();
    			div37 = element("div");
    			t31 = space();
    			div38 = element("div");
    			t32 = space();
    			div39 = element("div");
    			attr_dev(div0, "class", "right svelte-nujt4l");
    			add_location(div0, file, 6, 3, 87);
    			attr_dev(div1, "class", "searchbar svelte-nujt4l");
    			add_location(div1, file, 5, 2, 59);
    			attr_dev(div2, "class", "navbar svelte-nujt4l");
    			add_location(div2, file, 4, 4, 35);
    			attr_dev(div3, "class", "static-text svelte-nujt4l");
    			add_location(div3, file, 14, 3, 209);
    			attr_dev(span0, "class", "svelte-nujt4l");
    			add_location(span0, file, 16, 20, 297);
    			attr_dev(div4, "class", "li svelte-nujt4l");
    			add_location(div4, file, 16, 4, 281);
    			attr_dev(span1, "class", "svelte-nujt4l");
    			add_location(span1, file, 17, 20, 354);
    			attr_dev(div5, "class", "li svelte-nujt4l");
    			add_location(div5, file, 17, 4, 338);
    			attr_dev(span2, "class", "svelte-nujt4l");
    			add_location(span2, file, 18, 20, 412);
    			attr_dev(div6, "class", "li svelte-nujt4l");
    			add_location(div6, file, 18, 4, 396);
    			attr_dev(div7, "class", "dynamic-text svelte-nujt4l");
    			add_location(div7, file, 15, 3, 249);
    			attr_dev(div8, "class", "wrapper svelte-nujt4l");
    			add_location(div8, file, 13, 2, 183);
    			attr_dev(div9, "class", "secondcontainer svelte-nujt4l");
    			add_location(div9, file, 12, 1, 150);
    			attr_dev(h20, "class", "svelte-nujt4l");
    			add_location(h20, file, 30, 2, 535);
    			attr_dev(div10, "class", "title1 svelte-nujt4l");
    			add_location(div10, file, 29, 1, 511);
    			attr_dev(div11, "class", "item svelte-nujt4l");
    			add_location(div11, file, 34, 3, 622);
    			attr_dev(div12, "class", "item svelte-nujt4l");
    			add_location(div12, file, 35, 3, 651);
    			attr_dev(div13, "class", "item svelte-nujt4l");
    			add_location(div13, file, 36, 3, 680);
    			attr_dev(div14, "class", "item svelte-nujt4l");
    			add_location(div14, file, 37, 3, 709);
    			attr_dev(div15, "class", "card svelte-nujt4l");
    			add_location(div15, file, 33, 2, 599);
    			attr_dev(div16, "class", "cards1 svelte-nujt4l");
    			add_location(div16, file, 32, 1, 575);
    			attr_dev(div17, "class", "item svelte-nujt4l");
    			add_location(div17, file, 42, 3, 802);
    			attr_dev(div18, "class", "item svelte-nujt4l");
    			add_location(div18, file, 43, 3, 831);
    			attr_dev(div19, "class", "item svelte-nujt4l");
    			add_location(div19, file, 44, 3, 860);
    			attr_dev(div20, "class", "item svelte-nujt4l");
    			add_location(div20, file, 45, 3, 889);
    			attr_dev(div21, "class", "card svelte-nujt4l");
    			add_location(div21, file, 41, 2, 779);
    			attr_dev(div22, "class", "cards1 svelte-nujt4l");
    			add_location(div22, file, 40, 1, 755);
    			attr_dev(h21, "class", "svelte-nujt4l");
    			add_location(h21, file, 49, 2, 959);
    			attr_dev(div23, "class", "title1 svelte-nujt4l");
    			add_location(div23, file, 48, 1, 935);
    			attr_dev(div24, "class", "item svelte-nujt4l");
    			add_location(div24, file, 53, 3, 1046);
    			attr_dev(div25, "class", "item svelte-nujt4l");
    			add_location(div25, file, 54, 3, 1075);
    			attr_dev(div26, "class", "item svelte-nujt4l");
    			add_location(div26, file, 55, 3, 1104);
    			attr_dev(div27, "class", "item svelte-nujt4l");
    			add_location(div27, file, 56, 3, 1133);
    			attr_dev(div28, "class", "card svelte-nujt4l");
    			add_location(div28, file, 52, 2, 1023);
    			attr_dev(div29, "class", "cards1 svelte-nujt4l");
    			add_location(div29, file, 51, 1, 999);
    			attr_dev(div30, "class", "logo svelte-nujt4l");
    			add_location(div30, file, 63, 3, 1252);
    			attr_dev(div31, "class", "gitem svelte-nujt4l");
    			add_location(div31, file, 67, 4, 1321);
    			attr_dev(div32, "class", "gitem svelte-nujt4l");
    			add_location(div32, file, 68, 4, 1352);
    			attr_dev(div33, "class", "gitem svelte-nujt4l");
    			add_location(div33, file, 69, 4, 1383);
    			attr_dev(div34, "class", "gitem svelte-nujt4l");
    			add_location(div34, file, 70, 4, 1414);
    			attr_dev(div35, "class", "fgrid svelte-nujt4l");
    			add_location(div35, file, 66, 3, 1296);
    			attr_dev(div36, "class", "fitem svelte-nujt4l");
    			add_location(div36, file, 62, 2, 1228);
    			attr_dev(div37, "class", "fitem svelte-nujt4l");
    			add_location(div37, file, 73, 2, 1464);
    			attr_dev(div38, "class", "fitem svelte-nujt4l");
    			add_location(div38, file, 74, 2, 1493);
    			attr_dev(div39, "class", "fitem svelte-nujt4l");
    			add_location(div39, file, 75, 2, 1522);
    			attr_dev(div40, "class", "fcont svelte-nujt4l");
    			add_location(div40, file, 61, 2, 1205);
    			attr_dev(div41, "class", "footer svelte-nujt4l");
    			add_location(div41, file, 60, 1, 1181);
    			attr_dev(main, "class", "svelte-nujt4l");
    			add_location(main, file, 3, 0, 23);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, div2);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(main, t0);
    			append_dev(main, div9);
    			append_dev(div9, div8);
    			append_dev(div8, div3);
    			append_dev(div8, t2);
    			append_dev(div8, div7);
    			append_dev(div7, div4);
    			append_dev(div4, span0);
    			append_dev(div7, t4);
    			append_dev(div7, div5);
    			append_dev(div5, span1);
    			append_dev(div7, t6);
    			append_dev(div7, div6);
    			append_dev(div6, span2);
    			append_dev(main, t8);
    			append_dev(main, div10);
    			append_dev(div10, h20);
    			append_dev(main, t10);
    			append_dev(main, div16);
    			append_dev(div16, div15);
    			append_dev(div15, div11);
    			append_dev(div15, t11);
    			append_dev(div15, div12);
    			append_dev(div15, t12);
    			append_dev(div15, div13);
    			append_dev(div15, t13);
    			append_dev(div15, div14);
    			append_dev(main, t14);
    			append_dev(main, div22);
    			append_dev(div22, div21);
    			append_dev(div21, div17);
    			append_dev(div21, t15);
    			append_dev(div21, div18);
    			append_dev(div21, t16);
    			append_dev(div21, div19);
    			append_dev(div21, t17);
    			append_dev(div21, div20);
    			append_dev(main, t18);
    			append_dev(main, div23);
    			append_dev(div23, h21);
    			append_dev(main, t20);
    			append_dev(main, div29);
    			append_dev(div29, div28);
    			append_dev(div28, div24);
    			append_dev(div28, t21);
    			append_dev(div28, div25);
    			append_dev(div28, t22);
    			append_dev(div28, div26);
    			append_dev(div28, t23);
    			append_dev(div28, div27);
    			append_dev(main, t24);
    			append_dev(main, div41);
    			append_dev(div41, div40);
    			append_dev(div40, div36);
    			append_dev(div36, div30);
    			append_dev(div36, t26);
    			append_dev(div36, div35);
    			append_dev(div35, div31);
    			append_dev(div35, t27);
    			append_dev(div35, div32);
    			append_dev(div35, t28);
    			append_dev(div35, div33);
    			append_dev(div35, t29);
    			append_dev(div35, div34);
    			append_dev(div40, t30);
    			append_dev(div40, div37);
    			append_dev(div40, t31);
    			append_dev(div40, div38);
    			append_dev(div40, t32);
    			append_dev(div40, div39);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    		name: 'world'
    	}
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
