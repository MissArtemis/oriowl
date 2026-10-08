(function () {
  var world = new URLSearchParams(window.location.search).get('mode') === 'footprints';
  var map, selection, locationMarker, entryMarkers = [], pending = [], selectionVersion = 0, locationVersion = 0, searchConfigured = false;
  function emit(type, data) {
    var message = JSON.stringify(Object.assign({type:type},data || {}));
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
    else if (window.parent !== window) window.parent.postMessage(message, '*');
  }
  function error(message) { emit('error',{message:message}); }
  function text(value) { return String(value || '').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]}); }
  function valid(p) { return p && Number.isFinite(p.longitude) && Number.isFinite(p.latitude) && Math.abs(p.longitude)<=180 && Math.abs(p.latitude)<=90; }
  async function requestJSON(url) {
    var controller=new AbortController(), timer=setTimeout(function(){controller.abort()},13000);
    try {
      var response=await fetch(url,{signal:controller.signal}), data=await response.json();
      if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'位置服务暂时不可用');
      return data;
    } finally { clearTimeout(timer); }
  }
  function mark(p) {
    if (!selection) selection = new AMap.Marker({content:'<div class="selected-pin"></div>',anchor:'center',zIndex:200,map:map});
    selection.setPosition([p.longitude,p.latitude]);
  }
  function select(p, lookup, origin) {
    if (!valid(p)) return;
    var version = ++selectionVersion;
    mark(p); emit('selected',{place:p,origin:origin || 'user'});
    if (lookup) requestJSON('/api/places/reverse?longitude='+p.longitude+'&latitude='+p.latitude).then(function(result){
      if (version !== selectionVersion) return;
      p.address = result.address || p.address;
      p.city = result.city;
      if (origin !== 'location') p.name = result.name || '地图上的一处风景';
      emit('selected',{place:p,origin:origin || 'user'});
    }).catch(function(){
      if(version===selectionVersion)emit('lookupError',{message:'地址暂时无法获取，已选中坐标，可以继续记录'});
    });
  }
  window.oriowlReceive = function(command) {
    if (!map) { pending.push(command); return; }
    if (command.type === 'overview') { map.setZoomAndCenter(2,[105,20]); }
    if (command.type === 'focus' && valid(command.place)) {
      map.setZoomAndCenter(command.zoom || 15,[command.place.longitude,command.place.latitude]);
      select(command.place,false,command.origin);
    }
    if (command.type === 'locate' && valid(command.coords)) {
      var c = command.coords, version = ++locationVersion, selectionAtRequest = selectionVersion;
      // FastAPI uses the private REST key to convert WGS84 to GCJ-02.
      requestJSON('/api/coordinates/convert?longitude='+c.longitude+'&latitude='+c.latitude).then(function(result){
        if (version !== locationVersion) return;
        var p=result.place;
        if(!valid(p))throw new Error('位置坐标转换失败，请重试');
        p.name='我的当前位置';
        var ll=[p.longitude,p.latitude];
        if (!locationMarker) locationMarker = new AMap.Marker({content:'<div class="location-pin"></div>',anchor:'center',map:map,zIndex:190});
        locationMarker.setPosition(ll);
        if (command.center !== false && selectionAtRequest === selectionVersion) { map.setZoomAndCenter(16,ll); select(p,true,'location'); }
        emit('located',{place:p,requestId:command.requestId,settled:command.settled});
      }).catch(function(err){
        if(version===locationVersion)emit('locationError',{requestId:command.requestId,settled:command.settled,message:err.name==='AbortError'?'位置转换超时，请重试':err.message || '位置转换失败，请检查网络'});
      });
    }
    if (command.type === 'entries') {
      map.remove(entryMarkers); entryMarkers=[];
      (command.entries || []).forEach(function(entry){
        if (!valid(entry.place)) return;
        var marker=new AMap.Marker({position:[entry.place.longitude,entry.place.latitude],content:'<button type="button" class="marker" aria-label="打开足迹 '+text(entry.title)+'">'+(entry.hasPhoto?'▧ ':'✎ ')+text(entry.title)+'</button>',anchor:'bottom-center',map:map,zIndex:100});
        marker.on('click',function(){if(world)map.setZoomAndCenter(12,[entry.place.longitude,entry.place.latitude]);emit('entry',{id:entry.id,place:entry.place})}); entryMarkers.push(marker);
      });
    }
  };
  window.addEventListener('message',function(event){
    if (event.source !== window.parent) return;
    try { window.oriowlReceive(typeof event.data==='string'?JSON.parse(event.data):event.data); } catch (_) {}
  });
  function init() {
    map = new AMap.Map('map',{zoom:world?2:4,center:world?[105,20]:undefined,zooms:[2,20],viewMode:'2D',resizeEnable:true});
    AMap.plugin(world?['AMap.Scale','AMap.DistrictLayer']:['AMap.Scale'],function(){
      if(world){var layer=new AMap.DistrictLayer.World({zIndex:10,zooms:[2,20]});layer.setStyles({'stroke-width':1,'nation-stroke':'#96b9b1',fill:'#d5e8df33'});map.add(layer);}
      map.addControl(new AMap.Scale());
      if(!world)map.on('click',function(e){select({longitude:e.lnglat.lng,latitude:e.lnglat.lat,name:'地图上的一处风景',address:''},true)});
      emit('ready',{configured:true,searchConfigured:searchConfigured});
      pending.splice(0).forEach(window.oriowlReceive);
    });
    map.on('error',function(){error('高德地图加载失败，请检查 Key 的平台类型与域名设置')});
  }
  fetch('/map/config').then(function(res){if(!res.ok)throw new Error();return res.json()}).then(function(config){
    searchConfigured=!!config.searchConfigured;
    if (!config.configured) { document.getElementById('demo').hidden=false;emit('ready',{configured:false});return; }
    window._AMapSecurityConfig={serviceHost:window.location.origin+'/_AMapService'};
    var script=document.createElement('script');
    script.src='https://webapi.amap.com/maps?v=2.0&key='+encodeURIComponent(config.key);
    script.onload=function(){try{init()}catch(_){error('地图初始化失败，请检查高德 Key 和安全密钥')}};
    script.onerror=function(){error('无法连接高德地图，请检查手机网络')};
    document.head.appendChild(script);
  }).catch(function(){error('地图配置读取失败，请检查后端服务')});
})();
