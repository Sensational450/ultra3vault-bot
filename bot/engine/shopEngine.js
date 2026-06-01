const SHOP_ITEMS = {

"booster-small": {
    name: "Small XP Booster",
    cost: 100,
    type: "booster",
    multiplier: 2,
    minutes: 60
},

"booster-medium": {
    name: "Medium XP Booster",
    cost: 250,
    type: "booster",
    multiplier: 3,
    minutes: 180
},

"booster-large": {
    name: "Large XP Booster",
    cost: 500,
    type: "booster",
    multiplier: 5,
    minutes: 1440
},

"vip-7": {
    name: "VIP 7 Days",
    cost: 1000,
    type: "vip",
    days: 7
},

"vip-30": {
    name: "VIP 30 Days",
    cost: 3000,
    type: "vip",
    days: 30
}

};

function getItem(itemId) {
return SHOP_ITEMS[itemId];
}

function getAllItems() {
return SHOP_ITEMS;
}

module.exports = {
SHOP_ITEMS,
getItem,
getAllItems
};