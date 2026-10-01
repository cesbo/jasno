// Element props for h.*: GlobalProps, one *Props interface per element class and the H tag table, merged into
// module '@jasno/core'. Generated from lib.dom.d.ts by tools/gen-elements.cjs; tsc checks them, so agents rarely need to read them.
declare module '@jasno/core' {
  // <generated:elements> from lib.dom.d.ts (TypeScript 7.0.2) by tools/gen-elements.cjs; do not edit by hand
  /** Props every h.* element accepts: class, style, data-/aria- attributes, lowercase on<event> handlers and writable HTMLElement properties (value or Read<T>). */
  export interface GlobalProps<E extends HTMLElement> {
    class?: string | Read<string | undefined> | { readonly [name: string]: boolean | Read<boolean> } | undefined;
    style?: StyleProps | undefined;
    [attribute: `data-${string}`]: MaybeRead<string | number | boolean | null | undefined>;
    'aria-activedescendant'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-atomic'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-autocomplete'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-braillelabel'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-brailleroledescription'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-busy'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-checked'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-colcount'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-colindex'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-colindextext'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-colspan'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-controls'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-current'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-describedby'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-description'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-details'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-disabled'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-errormessage'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-expanded'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-flowto'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-haspopup'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-hidden'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-invalid'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-keyshortcuts'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-label'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-labelledby'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-level'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-live'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-modal'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-multiline'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-multiselectable'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-orientation'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-owns'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-placeholder'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-posinset'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-pressed'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-readonly'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-relevant'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-required'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-roledescription'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-rowcount'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-rowindex'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-rowindextext'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-rowspan'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-selected'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-setsize'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-sort'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-valuemax'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-valuemin'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-valuenow'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    'aria-valuetext'?: MaybeRead<string | number | boolean | null | undefined> | undefined;
    className?: { readonly "jasno: use class, not className": never } | undefined;
    for?: { readonly "jasno: use htmlFor (the DOM property), not for": never } | undefined;
    ref?: { readonly "jasno: no refs: keep the element, const input = h.input(...)": never } | undefined;
    key?: { readonly "jasno: keys go in each(list, { key, render })": never } | undefined;
    children?: { readonly "jasno: pass children after props: h.div(null, a, b)": never } | undefined;
    innerHTML?: { readonly "jasno: not allowed (Trusted Types); build nodes with h.* and text children": never } | undefined;
    onfullscreenchange?: Handler<HTMLElementEventMap['fullscreenchange'], E> | undefined;
    onfullscreenerror?: Handler<HTMLElementEventMap['fullscreenerror'], E> | undefined;
    onabort?: Handler<HTMLElementEventMap['abort'], E> | undefined;
    onanimationcancel?: Handler<HTMLElementEventMap['animationcancel'], E> | undefined;
    onanimationend?: Handler<HTMLElementEventMap['animationend'], E> | undefined;
    onanimationiteration?: Handler<HTMLElementEventMap['animationiteration'], E> | undefined;
    onanimationstart?: Handler<HTMLElementEventMap['animationstart'], E> | undefined;
    onauxclick?: Handler<HTMLElementEventMap['auxclick'], E> | undefined;
    onbeforeinput?: Handler<HTMLElementEventMap['beforeinput'], E> | undefined;
    onbeforematch?: Handler<HTMLElementEventMap['beforematch'], E> | undefined;
    onbeforetoggle?: Handler<HTMLElementEventMap['beforetoggle'], E> | undefined;
    onblur?: Handler<HTMLElementEventMap['blur'], E> | undefined;
    oncancel?: Handler<HTMLElementEventMap['cancel'], E> | undefined;
    oncanplay?: Handler<HTMLElementEventMap['canplay'], E> | undefined;
    oncanplaythrough?: Handler<HTMLElementEventMap['canplaythrough'], E> | undefined;
    onchange?: Handler<HTMLElementEventMap['change'], E> | undefined;
    onclick?: Handler<HTMLElementEventMap['click'], E> | undefined;
    onclose?: Handler<HTMLElementEventMap['close'], E> | undefined;
    oncommand?: Handler<HTMLElementEventMap['command'], E> | undefined;
    oncompositionend?: Handler<HTMLElementEventMap['compositionend'], E> | undefined;
    oncompositionstart?: Handler<HTMLElementEventMap['compositionstart'], E> | undefined;
    oncompositionupdate?: Handler<HTMLElementEventMap['compositionupdate'], E> | undefined;
    oncontextlost?: Handler<HTMLElementEventMap['contextlost'], E> | undefined;
    oncontextmenu?: Handler<HTMLElementEventMap['contextmenu'], E> | undefined;
    oncontextrestored?: Handler<HTMLElementEventMap['contextrestored'], E> | undefined;
    oncopy?: Handler<HTMLElementEventMap['copy'], E> | undefined;
    oncuechange?: Handler<HTMLElementEventMap['cuechange'], E> | undefined;
    oncut?: Handler<HTMLElementEventMap['cut'], E> | undefined;
    ondblclick?: Handler<HTMLElementEventMap['dblclick'], E> | undefined;
    ondrag?: Handler<HTMLElementEventMap['drag'], E> | undefined;
    ondragend?: Handler<HTMLElementEventMap['dragend'], E> | undefined;
    ondragenter?: Handler<HTMLElementEventMap['dragenter'], E> | undefined;
    ondragleave?: Handler<HTMLElementEventMap['dragleave'], E> | undefined;
    ondragover?: Handler<HTMLElementEventMap['dragover'], E> | undefined;
    ondragstart?: Handler<HTMLElementEventMap['dragstart'], E> | undefined;
    ondrop?: Handler<HTMLElementEventMap['drop'], E> | undefined;
    ondurationchange?: Handler<HTMLElementEventMap['durationchange'], E> | undefined;
    onemptied?: Handler<HTMLElementEventMap['emptied'], E> | undefined;
    onended?: Handler<HTMLElementEventMap['ended'], E> | undefined;
    onerror?: Handler<HTMLElementEventMap['error'], E> | undefined;
    onfocus?: Handler<HTMLElementEventMap['focus'], E> | undefined;
    onfocusin?: Handler<HTMLElementEventMap['focusin'], E> | undefined;
    onfocusout?: Handler<HTMLElementEventMap['focusout'], E> | undefined;
    onformdata?: Handler<HTMLElementEventMap['formdata'], E> | undefined;
    ongotpointercapture?: Handler<HTMLElementEventMap['gotpointercapture'], E> | undefined;
    oninput?: Handler<HTMLElementEventMap['input'], E> | undefined;
    oninvalid?: Handler<HTMLElementEventMap['invalid'], E> | undefined;
    onkeydown?: Handler<HTMLElementEventMap['keydown'], E> | undefined;
    onkeypress?: Handler<HTMLElementEventMap['keypress'], E> | undefined;
    onkeyup?: Handler<HTMLElementEventMap['keyup'], E> | undefined;
    onload?: Handler<HTMLElementEventMap['load'], E> | undefined;
    onloadeddata?: Handler<HTMLElementEventMap['loadeddata'], E> | undefined;
    onloadedmetadata?: Handler<HTMLElementEventMap['loadedmetadata'], E> | undefined;
    onloadstart?: Handler<HTMLElementEventMap['loadstart'], E> | undefined;
    onlostpointercapture?: Handler<HTMLElementEventMap['lostpointercapture'], E> | undefined;
    onmousedown?: Handler<HTMLElementEventMap['mousedown'], E> | undefined;
    onmouseenter?: Handler<HTMLElementEventMap['mouseenter'], E> | undefined;
    onmouseleave?: Handler<HTMLElementEventMap['mouseleave'], E> | undefined;
    onmousemove?: Handler<HTMLElementEventMap['mousemove'], E> | undefined;
    onmouseout?: Handler<HTMLElementEventMap['mouseout'], E> | undefined;
    onmouseover?: Handler<HTMLElementEventMap['mouseover'], E> | undefined;
    onmouseup?: Handler<HTMLElementEventMap['mouseup'], E> | undefined;
    onpaste?: Handler<HTMLElementEventMap['paste'], E> | undefined;
    onpause?: Handler<HTMLElementEventMap['pause'], E> | undefined;
    onplay?: Handler<HTMLElementEventMap['play'], E> | undefined;
    onplaying?: Handler<HTMLElementEventMap['playing'], E> | undefined;
    onpointercancel?: Handler<HTMLElementEventMap['pointercancel'], E> | undefined;
    onpointerdown?: Handler<HTMLElementEventMap['pointerdown'], E> | undefined;
    onpointerenter?: Handler<HTMLElementEventMap['pointerenter'], E> | undefined;
    onpointerleave?: Handler<HTMLElementEventMap['pointerleave'], E> | undefined;
    onpointermove?: Handler<HTMLElementEventMap['pointermove'], E> | undefined;
    onpointerout?: Handler<HTMLElementEventMap['pointerout'], E> | undefined;
    onpointerover?: Handler<HTMLElementEventMap['pointerover'], E> | undefined;
    onpointerrawupdate?: Handler<HTMLElementEventMap['pointerrawupdate'], E> | undefined;
    onpointerup?: Handler<HTMLElementEventMap['pointerup'], E> | undefined;
    onprogress?: Handler<HTMLElementEventMap['progress'], E> | undefined;
    onratechange?: Handler<HTMLElementEventMap['ratechange'], E> | undefined;
    onreset?: Handler<HTMLElementEventMap['reset'], E> | undefined;
    onresize?: Handler<HTMLElementEventMap['resize'], E> | undefined;
    onscroll?: Handler<HTMLElementEventMap['scroll'], E> | undefined;
    onscrollend?: Handler<HTMLElementEventMap['scrollend'], E> | undefined;
    onsecuritypolicyviolation?: Handler<HTMLElementEventMap['securitypolicyviolation'], E> | undefined;
    onseeked?: Handler<HTMLElementEventMap['seeked'], E> | undefined;
    onseeking?: Handler<HTMLElementEventMap['seeking'], E> | undefined;
    onselect?: Handler<HTMLElementEventMap['select'], E> | undefined;
    onselectionchange?: Handler<HTMLElementEventMap['selectionchange'], E> | undefined;
    onselectstart?: Handler<HTMLElementEventMap['selectstart'], E> | undefined;
    onslotchange?: Handler<HTMLElementEventMap['slotchange'], E> | undefined;
    onstalled?: Handler<HTMLElementEventMap['stalled'], E> | undefined;
    onsubmit?: Handler<HTMLElementEventMap['submit'], E> | undefined;
    onsuspend?: Handler<HTMLElementEventMap['suspend'], E> | undefined;
    ontimeupdate?: Handler<HTMLElementEventMap['timeupdate'], E> | undefined;
    ontoggle?: Handler<HTMLElementEventMap['toggle'], E> | undefined;
    ontouchcancel?: Handler<HTMLElementEventMap['touchcancel'], E> | undefined;
    ontouchend?: Handler<HTMLElementEventMap['touchend'], E> | undefined;
    ontouchmove?: Handler<HTMLElementEventMap['touchmove'], E> | undefined;
    ontouchstart?: Handler<HTMLElementEventMap['touchstart'], E> | undefined;
    ontransitioncancel?: Handler<HTMLElementEventMap['transitioncancel'], E> | undefined;
    ontransitionend?: Handler<HTMLElementEventMap['transitionend'], E> | undefined;
    ontransitionrun?: Handler<HTMLElementEventMap['transitionrun'], E> | undefined;
    ontransitionstart?: Handler<HTMLElementEventMap['transitionstart'], E> | undefined;
    onvolumechange?: Handler<HTMLElementEventMap['volumechange'], E> | undefined;
    onwaiting?: Handler<HTMLElementEventMap['waiting'], E> | undefined;
    onwebkitanimationend?: Handler<HTMLElementEventMap['webkitanimationend'], E> | undefined;
    onwebkitanimationiteration?: Handler<HTMLElementEventMap['webkitanimationiteration'], E> | undefined;
    onwebkitanimationstart?: Handler<HTMLElementEventMap['webkitanimationstart'], E> | undefined;
    onwebkittransitionend?: Handler<HTMLElementEventMap['webkittransitionend'], E> | undefined;
    onwheel?: Handler<HTMLElementEventMap['wheel'], E> | undefined;
    accessKey?: MaybeRead<E['accessKey'] | undefined> | undefined;
    autocapitalize?: MaybeRead<E['autocapitalize'] | undefined> | undefined;
    autocorrect?: MaybeRead<E['autocorrect'] | undefined> | undefined;
    dir?: MaybeRead<E['dir'] | undefined> | undefined;
    draggable?: MaybeRead<E['draggable'] | undefined> | undefined;
    hidden?: MaybeRead<E['hidden'] | undefined> | undefined;
    inert?: MaybeRead<E['inert'] | undefined> | undefined;
    lang?: MaybeRead<E['lang'] | undefined> | undefined;
    popover?: MaybeRead<E['popover'] | undefined> | undefined;
    spellcheck?: MaybeRead<E['spellcheck'] | undefined> | undefined;
    title?: MaybeRead<E['title'] | undefined> | undefined;
    translate?: MaybeRead<E['translate'] | undefined> | undefined;
    writingSuggestions?: MaybeRead<E['writingSuggestions'] | undefined> | undefined;
    role?: MaybeRead<E['role'] | undefined> | undefined;
    id?: MaybeRead<E['id'] | undefined> | undefined;
    slot?: MaybeRead<E['slot'] | undefined> | undefined;
    contentEditable?: MaybeRead<E['contentEditable'] | undefined> | undefined;
    enterKeyHint?: MaybeRead<E['enterKeyHint'] | undefined> | undefined;
    inputMode?: MaybeRead<E['inputMode'] | undefined> | undefined;
    autofocus?: MaybeRead<E['autofocus'] | undefined> | undefined;
    tabIndex?: MaybeRead<E['tabIndex'] | undefined> | undefined;
  }
  /** Props for h.a (HTMLAnchorElement). */
  export interface HTMLAnchorElementProps extends GlobalProps<HTMLAnchorElement> {
    download?: MaybeRead<HTMLAnchorElement['download'] | undefined> | undefined;
    hreflang?: MaybeRead<HTMLAnchorElement['hreflang'] | undefined> | undefined;
    ping?: MaybeRead<HTMLAnchorElement['ping'] | undefined> | undefined;
    referrerPolicy?: MaybeRead<HTMLAnchorElement['referrerPolicy'] | undefined> | undefined;
    rel?: MaybeRead<HTMLAnchorElement['rel'] | undefined> | undefined;
    target?: MaybeRead<HTMLAnchorElement['target'] | undefined> | undefined;
    type?: MaybeRead<HTMLAnchorElement['type'] | undefined> | undefined;
    href?: MaybeRead<HTMLAnchorElement['href'] | undefined> | undefined;
  }
  /** Props for h.abbr and every other tag whose element is a plain HTMLElement (HTMLElement). */
  export interface HTMLElementProps extends GlobalProps<HTMLElement> {}
  /** Props for h.area (HTMLAreaElement). */
  export interface HTMLAreaElementProps extends GlobalProps<HTMLAreaElement> {
    alt?: MaybeRead<HTMLAreaElement['alt'] | undefined> | undefined;
    coords?: MaybeRead<HTMLAreaElement['coords'] | undefined> | undefined;
    download?: MaybeRead<HTMLAreaElement['download'] | undefined> | undefined;
    ping?: MaybeRead<HTMLAreaElement['ping'] | undefined> | undefined;
    referrerPolicy?: MaybeRead<HTMLAreaElement['referrerPolicy'] | undefined> | undefined;
    rel?: MaybeRead<HTMLAreaElement['rel'] | undefined> | undefined;
    shape?: MaybeRead<HTMLAreaElement['shape'] | undefined> | undefined;
    target?: MaybeRead<HTMLAreaElement['target'] | undefined> | undefined;
    href?: MaybeRead<HTMLAreaElement['href'] | undefined> | undefined;
  }
  /** Props for h.audio (HTMLAudioElement). */
  export interface HTMLAudioElementProps extends GlobalProps<HTMLAudioElement> {
    autoplay?: MaybeRead<HTMLAudioElement['autoplay'] | undefined> | undefined;
    controls?: MaybeRead<HTMLAudioElement['controls'] | undefined> | undefined;
    crossOrigin?: MaybeRead<HTMLAudioElement['crossOrigin'] | undefined> | undefined;
    currentTime?: MaybeRead<HTMLAudioElement['currentTime'] | undefined> | undefined;
    defaultMuted?: MaybeRead<HTMLAudioElement['defaultMuted'] | undefined> | undefined;
    defaultPlaybackRate?: MaybeRead<HTMLAudioElement['defaultPlaybackRate'] | undefined> | undefined;
    disableRemotePlayback?: MaybeRead<HTMLAudioElement['disableRemotePlayback'] | undefined> | undefined;
    loop?: MaybeRead<HTMLAudioElement['loop'] | undefined> | undefined;
    muted?: MaybeRead<HTMLAudioElement['muted'] | undefined> | undefined;
    playbackRate?: MaybeRead<HTMLAudioElement['playbackRate'] | undefined> | undefined;
    preload?: MaybeRead<HTMLAudioElement['preload'] | undefined> | undefined;
    preservesPitch?: MaybeRead<HTMLAudioElement['preservesPitch'] | undefined> | undefined;
    src?: MaybeRead<HTMLAudioElement['src'] | undefined> | undefined;
    srcObject?: MaybeRead<HTMLAudioElement['srcObject'] | undefined> | undefined;
    volume?: MaybeRead<HTMLAudioElement['volume'] | undefined> | undefined;
    onencrypted?: Handler<HTMLMediaElementEventMap['encrypted'], HTMLAudioElement> | undefined;
    onwaitingforkey?: Handler<HTMLMediaElementEventMap['waitingforkey'], HTMLAudioElement> | undefined;
  }
  /** Props for h.blockquote (HTMLQuoteElement). */
  export interface HTMLQuoteElementProps extends GlobalProps<HTMLQuoteElement> {
    cite?: MaybeRead<HTMLQuoteElement['cite'] | undefined> | undefined;
  }
  /** Props for h.br (HTMLBRElement). */
  export interface HTMLBRElementProps extends GlobalProps<HTMLBRElement> {}
  /** Props for h.button (HTMLButtonElement). */
  export interface HTMLButtonElementProps extends GlobalProps<HTMLButtonElement> {
    command?: MaybeRead<HTMLButtonElement['command'] | undefined> | undefined;
    commandForElement?: MaybeRead<HTMLButtonElement['commandForElement'] | undefined> | undefined;
    disabled?: MaybeRead<HTMLButtonElement['disabled'] | undefined> | undefined;
    formAction?: MaybeRead<HTMLButtonElement['formAction'] | undefined> | undefined;
    formEnctype?: MaybeRead<HTMLButtonElement['formEnctype'] | undefined> | undefined;
    formMethod?: MaybeRead<HTMLButtonElement['formMethod'] | undefined> | undefined;
    formNoValidate?: MaybeRead<HTMLButtonElement['formNoValidate'] | undefined> | undefined;
    formTarget?: MaybeRead<HTMLButtonElement['formTarget'] | undefined> | undefined;
    name?: MaybeRead<HTMLButtonElement['name'] | undefined> | undefined;
    type?: MaybeRead<HTMLButtonElement['type'] | undefined> | undefined;
    value?: MaybeRead<HTMLButtonElement['value'] | undefined> | undefined;
    popoverTargetAction?: MaybeRead<HTMLButtonElement['popoverTargetAction'] | undefined> | undefined;
    popoverTargetElement?: MaybeRead<HTMLButtonElement['popoverTargetElement'] | undefined> | undefined;
  }
  /** Props for h.canvas (HTMLCanvasElement). */
  export interface HTMLCanvasElementProps extends GlobalProps<HTMLCanvasElement> {
    height?: MaybeRead<HTMLCanvasElement['height'] | undefined> | undefined;
    width?: MaybeRead<HTMLCanvasElement['width'] | undefined> | undefined;
  }
  /** Props for h.caption (HTMLTableCaptionElement). */
  export interface HTMLTableCaptionElementProps extends GlobalProps<HTMLTableCaptionElement> {}
  /** Props for h.col (HTMLTableColElement). */
  export interface HTMLTableColElementProps extends GlobalProps<HTMLTableColElement> {
    span?: MaybeRead<HTMLTableColElement['span'] | undefined> | undefined;
  }
  /** Props for h.data (HTMLDataElement). */
  export interface HTMLDataElementProps extends GlobalProps<HTMLDataElement> {
    value?: MaybeRead<HTMLDataElement['value'] | undefined> | undefined;
  }
  /** Props for h.datalist (HTMLDataListElement). */
  export interface HTMLDataListElementProps extends GlobalProps<HTMLDataListElement> {}
  /** Props for h.del (HTMLModElement). */
  export interface HTMLModElementProps extends GlobalProps<HTMLModElement> {
    cite?: MaybeRead<HTMLModElement['cite'] | undefined> | undefined;
    dateTime?: MaybeRead<HTMLModElement['dateTime'] | undefined> | undefined;
  }
  /** Props for h.details (HTMLDetailsElement). */
  export interface HTMLDetailsElementProps extends GlobalProps<HTMLDetailsElement> {
    name?: MaybeRead<HTMLDetailsElement['name'] | undefined> | undefined;
    open?: MaybeRead<HTMLDetailsElement['open'] | undefined> | undefined;
  }
  /** Props for h.dialog (HTMLDialogElement). */
  export interface HTMLDialogElementProps extends GlobalProps<HTMLDialogElement> {
    closedBy?: MaybeRead<HTMLDialogElement['closedBy'] | undefined> | undefined;
    open?: { readonly "jasno: open makes a NON-modal dialog; call el.showModal() in a handler and el.close() to close": never } | undefined;
    returnValue?: MaybeRead<HTMLDialogElement['returnValue'] | undefined> | undefined;
  }
  /** Props for h.div (HTMLDivElement). */
  export interface HTMLDivElementProps extends GlobalProps<HTMLDivElement> {}
  /** Props for h.dl (HTMLDListElement). */
  export interface HTMLDListElementProps extends GlobalProps<HTMLDListElement> {}
  /** Props for h.fieldset (HTMLFieldSetElement). */
  export interface HTMLFieldSetElementProps extends GlobalProps<HTMLFieldSetElement> {
    disabled?: MaybeRead<HTMLFieldSetElement['disabled'] | undefined> | undefined;
    name?: MaybeRead<HTMLFieldSetElement['name'] | undefined> | undefined;
  }
  /** Props for h.form (HTMLFormElement). */
  export interface HTMLFormElementProps extends GlobalProps<HTMLFormElement> {
    acceptCharset?: MaybeRead<HTMLFormElement['acceptCharset'] | undefined> | undefined;
    action?: MaybeRead<HTMLFormElement['action'] | undefined> | undefined;
    autocomplete?: MaybeRead<HTMLFormElement['autocomplete'] | undefined> | undefined;
    encoding?: MaybeRead<HTMLFormElement['encoding'] | undefined> | undefined;
    enctype?: MaybeRead<HTMLFormElement['enctype'] | undefined> | undefined;
    method?: MaybeRead<HTMLFormElement['method'] | undefined> | undefined;
    name?: MaybeRead<HTMLFormElement['name'] | undefined> | undefined;
    noValidate?: MaybeRead<HTMLFormElement['noValidate'] | undefined> | undefined;
    rel?: MaybeRead<HTMLFormElement['rel'] | undefined> | undefined;
    target?: MaybeRead<HTMLFormElement['target'] | undefined> | undefined;
  }
  /** Props for h.h1 (HTMLHeadingElement). */
  export interface HTMLHeadingElementProps extends GlobalProps<HTMLHeadingElement> {}
  /** Props for h.hr (HTMLHRElement). */
  export interface HTMLHRElementProps extends GlobalProps<HTMLHRElement> {}
  /** Props for h.iframe (HTMLIFrameElement). */
  export interface HTMLIFrameElementProps extends GlobalProps<HTMLIFrameElement> {
    allow?: MaybeRead<HTMLIFrameElement['allow'] | undefined> | undefined;
    allowFullscreen?: MaybeRead<HTMLIFrameElement['allowFullscreen'] | undefined> | undefined;
    height?: MaybeRead<HTMLIFrameElement['height'] | undefined> | undefined;
    loading?: MaybeRead<HTMLIFrameElement['loading'] | undefined> | undefined;
    name?: MaybeRead<HTMLIFrameElement['name'] | undefined> | undefined;
    referrerPolicy?: MaybeRead<HTMLIFrameElement['referrerPolicy'] | undefined> | undefined;
    sandbox?: MaybeRead<string | undefined> | undefined;
    src?: MaybeRead<HTMLIFrameElement['src'] | undefined> | undefined;
    width?: MaybeRead<HTMLIFrameElement['width'] | undefined> | undefined;
  }
  /** Props for h.img (HTMLImageElement). */
  export interface HTMLImageElementProps extends GlobalProps<HTMLImageElement> {
    alt?: MaybeRead<HTMLImageElement['alt'] | undefined> | undefined;
    crossOrigin?: MaybeRead<HTMLImageElement['crossOrigin'] | undefined> | undefined;
    decoding?: MaybeRead<HTMLImageElement['decoding'] | undefined> | undefined;
    fetchPriority?: MaybeRead<HTMLImageElement['fetchPriority'] | undefined> | undefined;
    height?: MaybeRead<HTMLImageElement['height'] | undefined> | undefined;
    isMap?: MaybeRead<HTMLImageElement['isMap'] | undefined> | undefined;
    loading?: MaybeRead<HTMLImageElement['loading'] | undefined> | undefined;
    referrerPolicy?: MaybeRead<HTMLImageElement['referrerPolicy'] | undefined> | undefined;
    sizes?: MaybeRead<HTMLImageElement['sizes'] | undefined> | undefined;
    src?: MaybeRead<HTMLImageElement['src'] | undefined> | undefined;
    srcset?: MaybeRead<HTMLImageElement['srcset'] | undefined> | undefined;
    useMap?: MaybeRead<HTMLImageElement['useMap'] | undefined> | undefined;
    width?: MaybeRead<HTMLImageElement['width'] | undefined> | undefined;
  }
  /** Props for h.input (HTMLInputElement). */
  export interface HTMLInputElementProps extends GlobalProps<HTMLInputElement> {
    accept?: MaybeRead<HTMLInputElement['accept'] | undefined> | undefined;
    alt?: MaybeRead<HTMLInputElement['alt'] | undefined> | undefined;
    autocomplete?: MaybeRead<HTMLInputElement['autocomplete'] | undefined> | undefined;
    capture?: MaybeRead<HTMLInputElement['capture'] | undefined> | undefined;
    checked?: MaybeRead<HTMLInputElement['checked'] | undefined> | undefined;
    defaultChecked?: MaybeRead<HTMLInputElement['defaultChecked'] | undefined> | undefined;
    defaultValue?: MaybeRead<HTMLInputElement['defaultValue'] | undefined> | undefined;
    dirName?: MaybeRead<HTMLInputElement['dirName'] | undefined> | undefined;
    disabled?: MaybeRead<HTMLInputElement['disabled'] | undefined> | undefined;
    files?: MaybeRead<HTMLInputElement['files'] | undefined> | undefined;
    formAction?: MaybeRead<HTMLInputElement['formAction'] | undefined> | undefined;
    formEnctype?: MaybeRead<HTMLInputElement['formEnctype'] | undefined> | undefined;
    formMethod?: MaybeRead<HTMLInputElement['formMethod'] | undefined> | undefined;
    formNoValidate?: MaybeRead<HTMLInputElement['formNoValidate'] | undefined> | undefined;
    formTarget?: MaybeRead<HTMLInputElement['formTarget'] | undefined> | undefined;
    height?: MaybeRead<HTMLInputElement['height'] | undefined> | undefined;
    indeterminate?: MaybeRead<HTMLInputElement['indeterminate'] | undefined> | undefined;
    max?: MaybeRead<HTMLInputElement['max'] | undefined> | undefined;
    maxLength?: MaybeRead<HTMLInputElement['maxLength'] | undefined> | undefined;
    min?: MaybeRead<HTMLInputElement['min'] | undefined> | undefined;
    minLength?: MaybeRead<HTMLInputElement['minLength'] | undefined> | undefined;
    multiple?: MaybeRead<HTMLInputElement['multiple'] | undefined> | undefined;
    name?: MaybeRead<HTMLInputElement['name'] | undefined> | undefined;
    pattern?: MaybeRead<HTMLInputElement['pattern'] | undefined> | undefined;
    placeholder?: MaybeRead<HTMLInputElement['placeholder'] | undefined> | undefined;
    readOnly?: MaybeRead<HTMLInputElement['readOnly'] | undefined> | undefined;
    required?: MaybeRead<HTMLInputElement['required'] | undefined> | undefined;
    selectionDirection?: MaybeRead<HTMLInputElement['selectionDirection'] | undefined> | undefined;
    selectionEnd?: MaybeRead<HTMLInputElement['selectionEnd'] | undefined> | undefined;
    selectionStart?: MaybeRead<HTMLInputElement['selectionStart'] | undefined> | undefined;
    size?: MaybeRead<HTMLInputElement['size'] | undefined> | undefined;
    src?: MaybeRead<HTMLInputElement['src'] | undefined> | undefined;
    step?: MaybeRead<HTMLInputElement['step'] | undefined> | undefined;
    type?: MaybeRead<HTMLInputElement['type'] | undefined> | undefined;
    value?: MaybeRead<HTMLInputElement['value'] | undefined> | undefined;
    valueAsDate?: MaybeRead<HTMLInputElement['valueAsDate'] | undefined> | undefined;
    valueAsNumber?: MaybeRead<HTMLInputElement['valueAsNumber'] | undefined> | undefined;
    webkitdirectory?: MaybeRead<HTMLInputElement['webkitdirectory'] | undefined> | undefined;
    width?: MaybeRead<HTMLInputElement['width'] | undefined> | undefined;
    popoverTargetAction?: MaybeRead<HTMLInputElement['popoverTargetAction'] | undefined> | undefined;
    popoverTargetElement?: MaybeRead<HTMLInputElement['popoverTargetElement'] | undefined> | undefined;
  }
  /** Props for h.label (HTMLLabelElement). */
  export interface HTMLLabelElementProps extends GlobalProps<HTMLLabelElement> {
    htmlFor?: MaybeRead<HTMLLabelElement['htmlFor'] | undefined> | undefined;
  }
  /** Props for h.legend (HTMLLegendElement). */
  export interface HTMLLegendElementProps extends GlobalProps<HTMLLegendElement> {}
  /** Props for h.li (HTMLLIElement). */
  export interface HTMLLIElementProps extends GlobalProps<HTMLLIElement> {
    value?: MaybeRead<HTMLLIElement['value'] | undefined> | undefined;
  }
  /** Props for h.map (HTMLMapElement). */
  export interface HTMLMapElementProps extends GlobalProps<HTMLMapElement> {
    name?: MaybeRead<HTMLMapElement['name'] | undefined> | undefined;
  }
  /** Props for h.menu (HTMLMenuElement). */
  export interface HTMLMenuElementProps extends GlobalProps<HTMLMenuElement> {}
  /** Props for h.meter (HTMLMeterElement). */
  export interface HTMLMeterElementProps extends GlobalProps<HTMLMeterElement> {
    high?: MaybeRead<HTMLMeterElement['high'] | undefined> | undefined;
    low?: MaybeRead<HTMLMeterElement['low'] | undefined> | undefined;
    max?: MaybeRead<HTMLMeterElement['max'] | undefined> | undefined;
    min?: MaybeRead<HTMLMeterElement['min'] | undefined> | undefined;
    optimum?: MaybeRead<HTMLMeterElement['optimum'] | undefined> | undefined;
    value?: MaybeRead<HTMLMeterElement['value'] | undefined> | undefined;
  }
  /** Props for h.ol (HTMLOListElement). */
  export interface HTMLOListElementProps extends GlobalProps<HTMLOListElement> {
    reversed?: MaybeRead<HTMLOListElement['reversed'] | undefined> | undefined;
    start?: MaybeRead<HTMLOListElement['start'] | undefined> | undefined;
    type?: MaybeRead<HTMLOListElement['type'] | undefined> | undefined;
  }
  /** Props for h.optgroup (HTMLOptGroupElement). */
  export interface HTMLOptGroupElementProps extends GlobalProps<HTMLOptGroupElement> {
    disabled?: MaybeRead<HTMLOptGroupElement['disabled'] | undefined> | undefined;
    label?: MaybeRead<HTMLOptGroupElement['label'] | undefined> | undefined;
  }
  /** Props for h.option (HTMLOptionElement). */
  export interface HTMLOptionElementProps extends GlobalProps<HTMLOptionElement> {
    defaultSelected?: MaybeRead<HTMLOptionElement['defaultSelected'] | undefined> | undefined;
    disabled?: MaybeRead<HTMLOptionElement['disabled'] | undefined> | undefined;
    label?: MaybeRead<HTMLOptionElement['label'] | undefined> | undefined;
    selected?: MaybeRead<HTMLOptionElement['selected'] | undefined> | undefined;
    value?: MaybeRead<HTMLOptionElement['value'] | undefined> | undefined;
  }
  /** Props for h.output (HTMLOutputElement). */
  export interface HTMLOutputElementProps extends GlobalProps<HTMLOutputElement> {
    defaultValue?: MaybeRead<HTMLOutputElement['defaultValue'] | undefined> | undefined;
    htmlFor?: MaybeRead<string | undefined> | undefined;
    name?: MaybeRead<HTMLOutputElement['name'] | undefined> | undefined;
    value?: MaybeRead<HTMLOutputElement['value'] | undefined> | undefined;
  }
  /** Props for h.p (HTMLParagraphElement). */
  export interface HTMLParagraphElementProps extends GlobalProps<HTMLParagraphElement> {}
  /** Props for h.picture (HTMLPictureElement). */
  export interface HTMLPictureElementProps extends GlobalProps<HTMLPictureElement> {}
  /** Props for h.pre (HTMLPreElement). */
  export interface HTMLPreElementProps extends GlobalProps<HTMLPreElement> {}
  /** Props for h.progress (HTMLProgressElement). */
  export interface HTMLProgressElementProps extends GlobalProps<HTMLProgressElement> {
    max?: MaybeRead<HTMLProgressElement['max'] | undefined> | undefined;
    value?: MaybeRead<HTMLProgressElement['value'] | undefined> | undefined;
  }
  /** Props for h.select (HTMLSelectElement). */
  export interface HTMLSelectElementProps extends GlobalProps<HTMLSelectElement> {
    autocomplete?: MaybeRead<HTMLSelectElement['autocomplete'] | undefined> | undefined;
    disabled?: MaybeRead<HTMLSelectElement['disabled'] | undefined> | undefined;
    multiple?: MaybeRead<HTMLSelectElement['multiple'] | undefined> | undefined;
    name?: MaybeRead<HTMLSelectElement['name'] | undefined> | undefined;
    required?: MaybeRead<HTMLSelectElement['required'] | undefined> | undefined;
    selectedIndex?: MaybeRead<HTMLSelectElement['selectedIndex'] | undefined> | undefined;
    size?: MaybeRead<HTMLSelectElement['size'] | undefined> | undefined;
    value?: MaybeRead<HTMLSelectElement['value'] | undefined> | undefined;
  }
  /** Props for h.source (HTMLSourceElement). */
  export interface HTMLSourceElementProps extends GlobalProps<HTMLSourceElement> {
    height?: MaybeRead<HTMLSourceElement['height'] | undefined> | undefined;
    media?: MaybeRead<HTMLSourceElement['media'] | undefined> | undefined;
    sizes?: MaybeRead<HTMLSourceElement['sizes'] | undefined> | undefined;
    src?: MaybeRead<HTMLSourceElement['src'] | undefined> | undefined;
    srcset?: MaybeRead<HTMLSourceElement['srcset'] | undefined> | undefined;
    type?: MaybeRead<HTMLSourceElement['type'] | undefined> | undefined;
    width?: MaybeRead<HTMLSourceElement['width'] | undefined> | undefined;
  }
  /** Props for h.span (HTMLSpanElement). */
  export interface HTMLSpanElementProps extends GlobalProps<HTMLSpanElement> {}
  /** Props for h.table (HTMLTableElement). */
  export interface HTMLTableElementProps extends GlobalProps<HTMLTableElement> {
    caption?: MaybeRead<HTMLTableElement['caption'] | undefined> | undefined;
    tFoot?: MaybeRead<HTMLTableElement['tFoot'] | undefined> | undefined;
    tHead?: MaybeRead<HTMLTableElement['tHead'] | undefined> | undefined;
  }
  /** Props for h.tbody (HTMLTableSectionElement). */
  export interface HTMLTableSectionElementProps extends GlobalProps<HTMLTableSectionElement> {}
  /** Props for h.td (HTMLTableCellElement). */
  export interface HTMLTableCellElementProps extends GlobalProps<HTMLTableCellElement> {
    abbr?: MaybeRead<HTMLTableCellElement['abbr'] | undefined> | undefined;
    colSpan?: MaybeRead<HTMLTableCellElement['colSpan'] | undefined> | undefined;
    headers?: MaybeRead<HTMLTableCellElement['headers'] | undefined> | undefined;
    rowSpan?: MaybeRead<HTMLTableCellElement['rowSpan'] | undefined> | undefined;
    scope?: MaybeRead<HTMLTableCellElement['scope'] | undefined> | undefined;
  }
  /** Props for h.textarea (HTMLTextAreaElement). */
  export interface HTMLTextAreaElementProps extends GlobalProps<HTMLTextAreaElement> {
    autocomplete?: MaybeRead<HTMLTextAreaElement['autocomplete'] | undefined> | undefined;
    cols?: MaybeRead<HTMLTextAreaElement['cols'] | undefined> | undefined;
    defaultValue?: MaybeRead<HTMLTextAreaElement['defaultValue'] | undefined> | undefined;
    dirName?: MaybeRead<HTMLTextAreaElement['dirName'] | undefined> | undefined;
    disabled?: MaybeRead<HTMLTextAreaElement['disabled'] | undefined> | undefined;
    maxLength?: MaybeRead<HTMLTextAreaElement['maxLength'] | undefined> | undefined;
    minLength?: MaybeRead<HTMLTextAreaElement['minLength'] | undefined> | undefined;
    name?: MaybeRead<HTMLTextAreaElement['name'] | undefined> | undefined;
    placeholder?: MaybeRead<HTMLTextAreaElement['placeholder'] | undefined> | undefined;
    readOnly?: MaybeRead<HTMLTextAreaElement['readOnly'] | undefined> | undefined;
    required?: MaybeRead<HTMLTextAreaElement['required'] | undefined> | undefined;
    rows?: MaybeRead<HTMLTextAreaElement['rows'] | undefined> | undefined;
    selectionDirection?: MaybeRead<HTMLTextAreaElement['selectionDirection'] | undefined> | undefined;
    selectionEnd?: MaybeRead<HTMLTextAreaElement['selectionEnd'] | undefined> | undefined;
    selectionStart?: MaybeRead<HTMLTextAreaElement['selectionStart'] | undefined> | undefined;
    value?: MaybeRead<HTMLTextAreaElement['value'] | undefined> | undefined;
    wrap?: MaybeRead<HTMLTextAreaElement['wrap'] | undefined> | undefined;
  }
  /** Props for h.time (HTMLTimeElement). */
  export interface HTMLTimeElementProps extends GlobalProps<HTMLTimeElement> {
    dateTime?: MaybeRead<HTMLTimeElement['dateTime'] | undefined> | undefined;
  }
  /** Props for h.tr (HTMLTableRowElement). */
  export interface HTMLTableRowElementProps extends GlobalProps<HTMLTableRowElement> {}
  /** Props for h.track (HTMLTrackElement). */
  export interface HTMLTrackElementProps extends GlobalProps<HTMLTrackElement> {
    default?: MaybeRead<HTMLTrackElement['default'] | undefined> | undefined;
    kind?: MaybeRead<HTMLTrackElement['kind'] | undefined> | undefined;
    label?: MaybeRead<HTMLTrackElement['label'] | undefined> | undefined;
    src?: MaybeRead<HTMLTrackElement['src'] | undefined> | undefined;
    srclang?: MaybeRead<HTMLTrackElement['srclang'] | undefined> | undefined;
  }
  /** Props for h.ul (HTMLUListElement). */
  export interface HTMLUListElementProps extends GlobalProps<HTMLUListElement> {}
  /** Props for h.video (HTMLVideoElement). */
  export interface HTMLVideoElementProps extends GlobalProps<HTMLVideoElement> {
    disablePictureInPicture?: MaybeRead<HTMLVideoElement['disablePictureInPicture'] | undefined> | undefined;
    height?: MaybeRead<HTMLVideoElement['height'] | undefined> | undefined;
    playsInline?: MaybeRead<HTMLVideoElement['playsInline'] | undefined> | undefined;
    poster?: MaybeRead<HTMLVideoElement['poster'] | undefined> | undefined;
    width?: MaybeRead<HTMLVideoElement['width'] | undefined> | undefined;
    autoplay?: MaybeRead<HTMLVideoElement['autoplay'] | undefined> | undefined;
    controls?: MaybeRead<HTMLVideoElement['controls'] | undefined> | undefined;
    crossOrigin?: MaybeRead<HTMLVideoElement['crossOrigin'] | undefined> | undefined;
    currentTime?: MaybeRead<HTMLVideoElement['currentTime'] | undefined> | undefined;
    defaultMuted?: MaybeRead<HTMLVideoElement['defaultMuted'] | undefined> | undefined;
    defaultPlaybackRate?: MaybeRead<HTMLVideoElement['defaultPlaybackRate'] | undefined> | undefined;
    disableRemotePlayback?: MaybeRead<HTMLVideoElement['disableRemotePlayback'] | undefined> | undefined;
    loop?: MaybeRead<HTMLVideoElement['loop'] | undefined> | undefined;
    muted?: MaybeRead<HTMLVideoElement['muted'] | undefined> | undefined;
    playbackRate?: MaybeRead<HTMLVideoElement['playbackRate'] | undefined> | undefined;
    preload?: MaybeRead<HTMLVideoElement['preload'] | undefined> | undefined;
    preservesPitch?: MaybeRead<HTMLVideoElement['preservesPitch'] | undefined> | undefined;
    src?: MaybeRead<HTMLVideoElement['src'] | undefined> | undefined;
    srcObject?: MaybeRead<HTMLVideoElement['srcObject'] | undefined> | undefined;
    volume?: MaybeRead<HTMLVideoElement['volume'] | undefined> | undefined;
    onencrypted?: Handler<HTMLMediaElementEventMap['encrypted'], HTMLVideoElement> | undefined;
    onwaitingforkey?: Handler<HTMLMediaElementEventMap['waitingforkey'], HTMLVideoElement> | undefined;
    onenterpictureinpicture?: Handler<HTMLVideoElementEventMap['enterpictureinpicture'], HTMLVideoElement> | undefined;
    onleavepictureinpicture?: Handler<HTMLVideoElementEventMap['leavepictureinpicture'], HTMLVideoElement> | undefined;
  }
  /** The tag functions behind h: h.div(props | null, ...children) creates and returns the real element; void elements (input, img, br, ...) and textarea take no children. */
  export interface H {
    a: (props: HTMLAnchorElementProps | null, ...children: Child[]) => HTMLAnchorElement;
    abbr: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    address: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    area: (props: HTMLAreaElementProps | null) => HTMLAreaElement;
    article: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    aside: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    audio: (props: HTMLAudioElementProps | null, ...children: Child[]) => HTMLAudioElement;
    b: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    bdi: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    bdo: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    blockquote: (props: HTMLQuoteElementProps | null, ...children: Child[]) => HTMLQuoteElement;
    br: (props: HTMLBRElementProps | null) => HTMLBRElement;
    button: (props: HTMLButtonElementProps | null, ...children: Child[]) => HTMLButtonElement;
    canvas: (props: HTMLCanvasElementProps | null, ...children: Child[]) => HTMLCanvasElement;
    caption: (props: HTMLTableCaptionElementProps | null, ...children: Child[]) => HTMLTableCaptionElement;
    cite: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    code: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    col: (props: HTMLTableColElementProps | null) => HTMLTableColElement;
    colgroup: (props: HTMLTableColElementProps | null, ...children: Child[]) => HTMLTableColElement;
    data: (props: HTMLDataElementProps | null, ...children: Child[]) => HTMLDataElement;
    datalist: (props: HTMLDataListElementProps | null, ...children: Child[]) => HTMLDataListElement;
    dd: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    del: (props: HTMLModElementProps | null, ...children: Child[]) => HTMLModElement;
    details: (props: HTMLDetailsElementProps | null, ...children: Child[]) => HTMLDetailsElement;
    dfn: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    dialog: (props: HTMLDialogElementProps | null, ...children: Child[]) => HTMLDialogElement;
    div: (props: HTMLDivElementProps | null, ...children: Child[]) => HTMLDivElement;
    dl: (props: HTMLDListElementProps | null, ...children: Child[]) => HTMLDListElement;
    dt: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    em: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    fieldset: (props: HTMLFieldSetElementProps | null, ...children: Child[]) => HTMLFieldSetElement;
    figcaption: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    figure: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    footer: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    form: (props: HTMLFormElementProps | null, ...children: Child[]) => HTMLFormElement;
    h1: (props: HTMLHeadingElementProps | null, ...children: Child[]) => HTMLHeadingElement;
    h2: (props: HTMLHeadingElementProps | null, ...children: Child[]) => HTMLHeadingElement;
    h3: (props: HTMLHeadingElementProps | null, ...children: Child[]) => HTMLHeadingElement;
    h4: (props: HTMLHeadingElementProps | null, ...children: Child[]) => HTMLHeadingElement;
    h5: (props: HTMLHeadingElementProps | null, ...children: Child[]) => HTMLHeadingElement;
    h6: (props: HTMLHeadingElementProps | null, ...children: Child[]) => HTMLHeadingElement;
    header: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    hgroup: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    hr: (props: HTMLHRElementProps | null) => HTMLHRElement;
    i: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    iframe: (props: HTMLIFrameElementProps | null, ...children: Child[]) => HTMLIFrameElement;
    img: (props: HTMLImageElementProps | null) => HTMLImageElement;
    input: (props: HTMLInputElementProps | null) => HTMLInputElement;
    ins: (props: HTMLModElementProps | null, ...children: Child[]) => HTMLModElement;
    kbd: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    label: (props: HTMLLabelElementProps | null, ...children: Child[]) => HTMLLabelElement;
    legend: (props: HTMLLegendElementProps | null, ...children: Child[]) => HTMLLegendElement;
    li: (props: HTMLLIElementProps | null, ...children: Child[]) => HTMLLIElement;
    main: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    map: (props: HTMLMapElementProps | null, ...children: Child[]) => HTMLMapElement;
    mark: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    menu: (props: HTMLMenuElementProps | null, ...children: Child[]) => HTMLMenuElement;
    meter: (props: HTMLMeterElementProps | null, ...children: Child[]) => HTMLMeterElement;
    nav: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    ol: (props: HTMLOListElementProps | null, ...children: Child[]) => HTMLOListElement;
    optgroup: (props: HTMLOptGroupElementProps | null, ...children: Child[]) => HTMLOptGroupElement;
    option: (props: HTMLOptionElementProps | null, ...children: Child[]) => HTMLOptionElement;
    output: (props: HTMLOutputElementProps | null, ...children: Child[]) => HTMLOutputElement;
    p: (props: HTMLParagraphElementProps | null, ...children: Child[]) => HTMLParagraphElement;
    picture: (props: HTMLPictureElementProps | null, ...children: Child[]) => HTMLPictureElement;
    pre: (props: HTMLPreElementProps | null, ...children: Child[]) => HTMLPreElement;
    progress: (props: HTMLProgressElementProps | null, ...children: Child[]) => HTMLProgressElement;
    q: (props: HTMLQuoteElementProps | null, ...children: Child[]) => HTMLQuoteElement;
    rp: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    rt: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    ruby: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    s: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    samp: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    search: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    section: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    select: (props: HTMLSelectElementProps | null, ...children: Child[]) => HTMLSelectElement;
    small: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    source: (props: HTMLSourceElementProps | null) => HTMLSourceElement;
    span: (props: HTMLSpanElementProps | null, ...children: Child[]) => HTMLSpanElement;
    strong: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    sub: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    summary: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    sup: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    table: (props: HTMLTableElementProps | null, ...children: Child[]) => HTMLTableElement;
    tbody: (props: HTMLTableSectionElementProps | null, ...children: Child[]) => HTMLTableSectionElement;
    td: (props: HTMLTableCellElementProps | null, ...children: Child[]) => HTMLTableCellElement;
    textarea: (props: HTMLTextAreaElementProps | null) => HTMLTextAreaElement;
    tfoot: (props: HTMLTableSectionElementProps | null, ...children: Child[]) => HTMLTableSectionElement;
    th: (props: HTMLTableCellElementProps | null, ...children: Child[]) => HTMLTableCellElement;
    thead: (props: HTMLTableSectionElementProps | null, ...children: Child[]) => HTMLTableSectionElement;
    time: (props: HTMLTimeElementProps | null, ...children: Child[]) => HTMLTimeElement;
    tr: (props: HTMLTableRowElementProps | null, ...children: Child[]) => HTMLTableRowElement;
    track: (props: HTMLTrackElementProps | null) => HTMLTrackElement;
    u: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    ul: (props: HTMLUListElementProps | null, ...children: Child[]) => HTMLUListElement;
    var: (props: HTMLElementProps | null, ...children: Child[]) => HTMLElement;
    video: (props: HTMLVideoElementProps | null, ...children: Child[]) => HTMLVideoElement;
    wbr: (props: HTMLElementProps | null) => HTMLElement;
  }
  // </generated:elements>

  export {};
}
