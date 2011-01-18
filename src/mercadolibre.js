;(function(cookie) {

window.MercadoLibre = {
  baseURL: "https://api.mercadolibre.com",
  
  authorizationURL: {"MLA":"http://auth-frontend.mercadolibre.com.ar/authorization",
                     "MCR":"http://auth-frontend.mercadolibre.co.cr/authorization"},
  //600 seconds = 10 minutes
  silentAuthorizationRetryInterval: 600,
  
  hash: {},
  
  callbacks: {},

  _map: {},

  init: function(options) {
    this.options = options

    //Replace defaults
    if (this.options.sandbox) this.baseURL = this.baseURL.replace(/api\./, "sandbox.")
    window.Storage.init({"disableLocalStorage": this.options.disableLocalStorage})
    if (this.options.silentAuthorizationRetryInterval) this.silentAuthorizationRetryInterval = this.options.silentAuthorizationRetryInterval
    
    this._initAuthorization()
  },

  get: function(url, callback) {
    Sroc.get(this._url(url), {}, callback)
  },

  post: function(url, params, callback) {
    Sroc.post(this._url(url), params, callback)
  },

  getToken: function() {
    var token = this._get('access_token')
    if(token){
        var dExp = new Date(this._get('date_to_expire_in_as_ms') )
        var now = new Date()
        if(dExp < now){
            token = null
        }
    }
    return (token && token.length > 0) ? token : null
  },
  
  requireLogin: function(callback) {
    var token = this.getToken()

    if (!token) {
      this.pendingCallback = callback
      this.login()
    }else {
      callback()
    }
  },

  login: function() {
    this._cleanIframe()
    this._popup(this._createAuthorizationURL("popup"))
  },

  bind: function(event, callback) {
    if (typeof(this.callbacks[event]) == "undefined") this.callbacks[event] = []
    this.callbacks[event].push(callback)
  },

  trigger: function(event, args) {
    var callbacks = this.callbacks[event]

    if (typeof(callbacks) == "undefined") return

    for (i = 0; i < callbacks.length; i++) {
      callbacks[i].apply(null, args)
    }
  },

  logout: function() {
    this._set("access_token", null)
    this._set("expires_in", null)
    this._triggerSessionChange()
  },
  
  removeAccessToken:function() {
    this._set("access_token", null)
    this._set("expires_in", null)
    this._triggerSessionChange()
  },
    
  silentAuthorization:function(){
    this._iframe = document.createElement("iframe")
    var url = this._createAuthorizationURL("iframe")
    this._iframe.setAttribute("src", url)
    this._iframe.style.width = "0px"
    this._iframe.style.height = "0px"
    document.body.appendChild(this._iframe)
  },
  
  _createAuthorizationURL:function(state){
    var xd_url = window.location.protocol + "//" + window.location.host + this.options.xd_url
    var interactionModeParams = "&state="+ state +(state == "iframe" ? "&interactive=0" : "&display=popup")
    var url = this.authorizationURL[this.site_id] + "?redirect_uri=" + escape(xd_url) + "&response_type=token&client_id=" + this.options.client_id + interactionModeParams
    return url
  },
 
  _initAuthorization: function(){
    this.get("/applications/"+this.options.client_id, function(resp){
        this.MercadoLibre.client = resp[2]
        this.MercadoLibre.site_id = resp[2].site_id
        //If we don't have an access_token we try to get it
        if(!this.MercadoLibre.getToken()){
            this.MercadoLibre.silentAuthorization()
        }
    })
  },

  _loginComplete: function() {
    //Clean up our interface
    this._cleanIframe()
    if(this._popupWindow) this._popupWindow.close()
    //Set up the next silent authorization
    this._repeatAuthorizationAfter(this._get("expires_in"))
    var dateToExpireInAsMS = new Date().getTime() + (this._get("expires_in")) * 1000
    this._set("date_to_expire_in_as_ms", dateToExpireInAsMS)
    //Do user staff
    this._triggerSessionChange()
    if (this.pendingCallback) this.pendingCallback()
  },
  
  _cleanIframe:function(){
    if(this._iframe)
        document.body.removeChild(this._iframe)
        this._iframe = null
  },

  _triggerSessionChange: function() {
    this.trigger("session.change", [this.getToken() ? true : false])
  },
  
  _repeatAuthorizationAfter: function(seconds){
     if(!this.getToken()){
         if(this.nextAuthorizationCallback){
            clearTimeout(this.nextAuthorizationCallback)
         }         
         this.nextAuthorizationCallback= setTimeout("this.MercadoLibre.silentAuthorization()", seconds * 1000)
     }
  },

  // Check if we're returning from a redirect
  // after authentication inside an iframe.
  _checkPostAuthorization: function() {
    if (this.hash.state){
        if(this.hash.state == "popup"){
            window.opener.MercadoLibre._loginComplete()  
        }else if(this.hash.state == "iframe"){
            if(this.hash.error == "not_logged_in" || this.hash.error == "unauthorized_application"){
                window.parent.MercadoLibre._repeatAuthorizationAfter(window.parent.MercadoLibre.silentAuthorizationRetryInterval)
            }else{
                window.parent.MercadoLibre._loginComplete()  
            }
        } 
    }
  },

  _url: function(url) {
    url = this.baseURL + url

    var token = this.getToken()

    if (token) {
      var append = url.indexOf("?") > -1 ? "&" : "?"

      url += append + "access_token=" + token
    }

    return url
  },

  _parseHash: function() {
    var hash = window.location.hash.substr(1)

    if (hash.length == 0) return

    var self = this

    var pairs = hash.split("&")

    for (var i = 0; i < pairs.length; i++) {
      var pair = null;

      if (pair = pairs[i].match(/([A-Za-z_\-]+)=(.*)$/)) {
        self.hash[pair[1]] = pair[2]
      }
    }

    if (this.hash.access_token) {
      this._set("access_token",this.hash.access_token)
      this._set("expires_in", parseInt(this.hash.expires_in))  
      window.location.hash = ""
    }
  },
  
  
  _get:function(key){
    var value = null
    if( this._browserHasLocalStorageSupport() ){
        value = window.localStorage[key]
    }else{
        value = this._map[key]
    }
    return value
  },
  
  _set:function(key, value){
    if( this._browserHasLocalStorageSupport()){
        window.localStorage[key] = value         
    }else{
        this._map[key] = value
    }
  },
  
  _browserHasLocalStorageSupport:function() {
        try {
            return !!window.localStorage.getItem
        } catch(e) {
            return false
        }
    },
    
  _popup: function(url) {
    if (!this._popupWindow || this._popupWindow.closed) {
      var width = 830
      var height = 510
      var left = parseInt((screen.availWidth - width) / 2);
      var top = parseInt((screen.availHeight - height) / 2);

      this._popupWindow = window.open(url, "mercadolibre-login",
        "toolbar=no,dependent=yes,dialog=yes,status=no,location=yes,menubar=no,resizable=no,scrollbars=no,width=" + width + ",height=" + height + ",left=" + left + ",top=" + top + "screenX=" + left + ",screenY=" + top
      )
    }
    else {
      this._popupWindow.focus()
    }
  }
}

MercadoLibre._parseHash()

MercadoLibre._checkPostAuthorization()

})(cookie);
