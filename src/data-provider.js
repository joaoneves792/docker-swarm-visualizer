import EventEmitter from 'eventemitter3';
import _ from 'lodash';
import { uuidRegExp } from './utils/helpers';

import {
    getUri,
    getParallel,
    getAllContainers,
    getAllNodes,
    getAllTasks,
    getAllServices,
    getAllNodeClusters,
    getWebSocket,
    getAllContainersFromNode
    } from './utils/request';

let STARTED = 0;

let SINGLETON;
let CURRENT_SERVICES_URIS;

let PHYSICAL_STRUCT;

let tutumEventHandler = (e) => {
  console.log(e);
};

let nodeOrContainerExists = (arr, value) => {

  for (var i=0, iLen=arr.length; i<iLen; i++) {

    if (arr[i].ID == value) return true;
  }
  return false;
};

let strToHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
};

let hashToHexColor = (hash) => {
  let color = "#";
  for (var i = 0; i < 3; ) {
    color += ("00" + ((hash >> i++ * 8) & 0xFF).toString(16)).slice(-2);
  }
  return color;
}

let stringToColor = (str) => {
  let hash = strToHash(str);
  let color = hashToHexColor(hash);
  return color;
};



let physicalStructProvider = ([initialNodes, initialContainers, initialServices, initialActualContainers]) => {
  let containers = _.map(initialContainers, _.cloneDeep);
  let actualContainers = _.map(initialActualContainers, _.cloneDeep);
  let nodeClusters = [{uuid:"clusterid", name:""}];
  let nodes = _.map(initialNodes, _.cloneDeep);
  let root = [];

  let addContainer = (container, containersFromNodes) => {
    
    var cloned = Object.assign({},container);
    let NodeID = cloned.NodeID;
    let containerID = cloned.Status.ContainerStatus.ContainerID;

    //Match containers
    let matchedContainer = null;
    containersFromNodes.forEach((ct)=>{ if(ct.Id == containerID){matchedContainer = ct; }})

    //Fill in network info
    let nwInfo = "Networks:<br/>";
    for (var i = 0; i < cloned.NetworksAttachments.length; i++) {
        let netId = cloned.NetworksAttachments[i].Network.ID;
        let ip = "Unknown";
        if(matchedContainer != null){
            let networks = matchedContainer.NetworkSettings.Networks;
            for(var net in networks){
                if(networks.hasOwnProperty(net)){
                    if(networks[net].NetworkID == netId){
                        ip=networks[net].IPAddress;
                    }
                }
            }
        }
        nwInfo = nwInfo + cloned.NetworksAttachments[i].Network.Spec.Name + 
		    " : " +
		    cloned.NetworksAttachments[i].Network.DriverState.Name +
		    "<br/> IP: " +
		    ip + "<br/>";
    }

    _.find(root,(cluster) => {
    var node = _.find(cluster.children,{ ID:NodeID });
    if(!node) return;
    var dt = new Date(cloned.UpdatedAt);
    var color =  stringToColor(cloned.ServiceID);
    let serviceName = cloned.ServiceName;
    let imageNameRegex = /([^/]+?)(\:([^/]+))?$/;
    let imageNameMatches = imageNameRegex.exec(cloned.Spec.ContainerSpec.Image);
    let tagName = imageNameMatches[3];
    let dateStamp = dt.getDate()+"/"+(dt.getMonth()+1)+" "+ dt.getHours()+":"+dt.getMinutes();
    let startState=cloned.Status.State;



    let imageTag ="<div style='height: 100%; padding: 5px 5px 5px 5px; border: 2px solid "+color+"'>"+
        "<span class='contname' style='color: white; font-weight: bold;font-size: 12px'>"+ serviceName +"</span>"+
        "<br/> image : " + imageNameMatches[0] +
        //"<br/> tag : " + (tagName ? tagName : "latest") +
        (cloned.Spec.ContainerSpec.Args?"<br/> cmd : "+cloned.Spec.ContainerSpec.Args : "" ) +
        //"<br/> updated : " + dateStamp +
        //"<br/>"+ cloned.Status.ContainerStatus.ContainerID +
        "<br/> state : "+startState +
	    "<br/>"+ nwInfo +
        "</div>";

    if (node.Spec.Role=='manager')  {
      let containerlink = window.location.href+  "apis/containers/"+cloned.Status.ContainerStatus.ContainerID + "/json";
      cloned.link = containerlink;
    }
    cloned.tag = imageTag;
    cloned.state = startState;

    node.children.push(cloned);
    return true;
  });
},

updateContainer = (container, services) => {
  let {uuid, node} = container;
  let [nodeUuid] = uuidRegExp.exec(node);
  _.find(root,(cluster) => {
    let node = _.findWhere(cluster.children,{ uuid: nodeUuid });
  if(!node) return;

  let target = _.findWhere(node.children,{ uuid }) || {};
  if(!target) return;

  Object.assign(target,container);
  return true;
});
},

data = () => {
  let clone = _.cloneDeep(root);
  _.remove(clone,({uuid,children}) => {
    return uuid === 'BYON' && !children.length
  });

  return {root: clone};
},

addNodeCluster = (nodeCluster) => {
  var cloned = Object.assign({},nodeCluster);
  cloned.children = [];
  root.push(cloned);
},

removeNodeCluster = (nodeCluster) => {
  _.remove(root,{ uuid: nodeCluster.uuid });
},

updateNodeCluster = (nodeCluster) => {
  var currentCluster = _.findWhere(root,{ uuid: nodeCluster.uuid });
  Object.assign(currentCluster,nodeCluster);
},

addNode = (node) => {
  let cloned = Object.assign({},node);
  cloned.children = [];
  let clusterUuid = "clusterid";
  let cluster = _.findWhere(root,{ uuid: clusterUuid });
  if(cluster) cluster.children.push(cloned);
},
updateNode = (node, state,spec) => {
  node.state = state;
  node.Spec = spec;
},
updateData = (resources) => {
  updateNodes(resources[0]);

  updateContainers(resources[1], resources[2], resources[3]);
  data();
},
updateNodes = (nodes) => {
  let currentnodelist = root[0].children;
  for (let node of nodes) {
    if(!nodeOrContainerExists(currentnodelist,node.ID)) {
      updateNode(node,'ready');

      addNode(node);
    } else {
      for (let currentnode of currentnodelist) {
        if (node.ID == currentnode.ID) {
          name = node.Description.Hostname;
          if(name.length>0) {
            currentnode.Description.Hostname = name ;
    	    let role = node.Spec.Role;
            currentnode.name = name +
    	    " <br/>"+(currentnode.Status.Addr) +
            " <br/> "+ role+
            " <br/>"+(currentnode.Description.Resources.MemoryBytes/1024/1024/1024).toFixed(1)+"G RAM<br/>";

	    for (var key in node.Spec.Labels) {
              if(node.Spec.Labels[key].length>0){
                currentnode.name += " <br/> " + key + "=" + node.Spec.Labels[key];
              } else {
                currentnode.name += " <br/> " + key;
              }
            }
          }
          updateNode(currentnode, node.state, node.Spec);
        }
      }

    }
  }
  for (let node of currentnodelist) {
    if(!nodeOrContainerExists(nodes,node.ID)){
      updateNode(node,'down');
    }
  }
},
updateContainers = (containers, services, allContainers) => {
  let nodes = root[0].children;
  // clearn all current children before rendering
  for(let node of nodes) {
    node.children = [];
  }

  for (let container of containers) {
    let contNodeId = container.NodeID;
    let service = _.find(services, function(o) { return o.ID == container.ServiceID; });
    container.ServiceName = service.Spec.Name;
    for (var i=0, iLen=nodes.length; i<iLen; i++) {
      if (nodes[i].ID == contNodeId) {
        addContainer(container, allContainers);
      }
    }

  }

};

nodeClusters.forEach(addNodeCluster);
nodes.forEach(addNode);

containers.forEach((container) =>{ addContainer(container, actualContainers); });

return {
  addContainer,
  updateData,
  updateContainer,
  data,
  addNode,
  updateNode,
  addNodeCluster,
  removeNodeCluster,
  updateNodeCluster,
};
}

class DataProvider extends EventEmitter {
  constructor() {
    super()
  }

  start() {
    STARTED = 1;
    //console.log(STARTED);
    var clusterInit = Promise.all([
          getAllNodes(),
          getAllTasks(),
          getAllServices(),
          getAllContainers()
        ])
            .then((resources) => {
          _.remove(resources[1],(nc) => nc.state === 'Empty cluster' || nc.state === 'Terminated');
    return resources;
  });

  Promise.all([ clusterInit ])
.then(([resources]) => {
  PHYSICAL_STRUCT = physicalStructProvider(resources);
      this.emit('infrastructure-data',PHYSICAL_STRUCT.data());
      this.emit('start-reload');
});
}

reload() {
  if(STARTED == 0) return;
  STARTED++;

  // console.log(STARTED);
  var clusterInit = Promise.all([
        getAllNodes(),
        getAllTasks(),
        getAllServices(),
        getAllContainers()
      ])
          .then((resources) => {
        _.remove(resources[1],(nc) => nc.state === 'Empty cluster' || nc.state === 'Terminated');
  return resources;
});



Promise.all([ clusterInit ])
    .then(([resources]) => {
        for(var i=0; i<resources[0].length; i++){
            let node = resources[0][i];
            if(node.Spec.Role != "manager"){
                getAllContainersFromNode(node.Status.Addr).then((data) => {
                    resources[3] = resources[3].concat(_.map(data, _.cloneDeep));
                });
	        }
        }
    });


new Promise(resolve => setTimeout(resolve, 500)).then( () => {
    Promise.all([ clusterInit ])
        .then(([resources]) => {
            if (!PHYSICAL_STRUCT)
                PHYSICAL_STRUCT = physicalStructProvider(resources);
            PHYSICAL_STRUCT.updateData(resources);
            this.emit('infrastructure-data', PHYSICAL_STRUCT.data());
        });
    });
}
}

export default SINGLETON = new DataProvider();
