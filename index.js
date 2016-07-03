/* ========================================================================
 * Beer Distribution Game Simulator: index.js
 * ========================================================================
 * The MIT License (MIT)
 *
 * Copyright (c) 2016-2017 Miron Vranjes. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 * ======================================================================== */

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var groups = [];
var users = {};
var roles = [];

var numUsers = 0;
var gameStarted = false;
var gameEnded = false;

var inventory_cost = 0.5;
var backlog_cost = 1;
var starting_inventory = 12;
var starting_throughput = 4;
var customer_demand = [4, 8, 12, 16, 20];

// This controls how the roles are labeled
var BEER_NAMES = ["Retailer", "Wholesaler", "Regional Warehouse", "Factory"];

// This is what stores all the role data during the game
var ROLE_0 = {
    "name": BEER_NAMES[0],
    "upstream": {
        "name": BEER_NAMES[1],
        "orders": starting_throughput,
        "shipments": starting_throughput
    },
    "downstream": {
        "name": "Customer",
        "orders": starting_throughput,
        "shipments": starting_throughput
    }
};
var ROLE_1 = {
    "name": BEER_NAMES[1],
    "upstream": {
        "name": BEER_NAMES[2],
        "orders": starting_throughput,
        "shipments": starting_throughput
    },
    "downstream": {
        "name": BEER_NAMES[0],
        "orders": starting_throughput,
        "shipments": starting_throughput
    }
};
var ROLE_2 = {
    "name": BEER_NAMES[2],
    "upstream": {
        "name": BEER_NAMES[3],
        "orders": starting_throughput,
        "shipments": starting_throughput
    },
    "downstream": {
        "name": BEER_NAMES[1],
        "orders": starting_throughput,
        "shipments": starting_throughput
    }
};
var ROLE_3 = {
    "name": BEER_NAMES[3],
    "upstream": {
        "name": "Factory",
        "orders": starting_throughput,
        "shipments": starting_throughput
    },
    "downstream": {
        "name": BEER_NAMES[2],
        "orders": starting_throughput,
        "shipments": starting_throughput
    }
};

// This array is used for assinging roles
var BEER_ROLES = [ROLE_0, ROLE_1, ROLE_2, ROLE_3];

// Everything in public is served up
app.use(express.static(__dirname + '/public'));

// Users has established a connection
io.on('connection', function (socket) {
    var addedUser = false;

    // Register the user (can only happen when a game is not in progress)
    // If a user leaves by accident, try to put them back in their group (if they give the same username)
    socket.on('submit username', function (msg, callback) {
        if (addedUser) return;

        console.log(socket.id + ": " + msg);
        var user = registerUser(socket.id, msg);

        if (user) {
            ++numUsers;
            socket.name = user.name;
            addedUser = true;
            callback({ numUsers: numUsers, idx: user.index, group: groups[user.group], gameEnded: gameEnded });
            socket.join(user.group);

            if (!gameStarted && !gameEnded) io.to(user.group).emit('group member joined', { idx: user.index, update: groups[user.group].users[user.index] });

            socket.broadcast.emit('user joined', {
                username: socket.name,
                numUsers: numUsers
            });
            io.to("admins").emit('update table', { numUsers: numUsers, groups: groups });
        } else {
            if (gameStarted || gameEnded) {
                callback("Game Started");
            } else {
                callback("Invalid Username");
            }
        }
    });

    // User has left, update groups
    socket.on('disconnect', function () {
        console.log('Got disconnected!');
        if (addedUser) {
            var user = users[socket.name];
            if (user.socketId) delete users[socket.name].socketId;
            delete groups[user.group].users[user.index].socketId;

            --numUsers;

            if (!gameStarted) io.to(user.group).emit('group member left', {
                idx: user.index,
                update: groups[user.group].users[user.index]
            });

            socket.broadcast.emit('user left', {
                username: socket.name,
                numUsers: numUsers
            });
            io.to("admins").emit('update table', { numUsers: numUsers, groups: groups });
        }
    });

    // This is called by the admin system
    socket.on('submit password', function (msg, callback) {
        // Not very secure :P
        if (msg == "admin") {
            socket.join("admins");

            var gameStatus = "";
            if (gameStarted && !gameEnded) {
                gameStatus = "started";
            } else if (gameStarted && gameEnded) {
                gameStatus = "ended";
            } else {
                gameStatus = "waiting";
            }

            callback({ status: gameStatus, numUsers: numUsers, groups: groups });
        } else {
            callback("Invalid Password");
        }
    });

    // Acknowledge the change group
    socket.on('change group', function (msg) {
        socket.leave(msg + 1);
        socket.join(msg);
    });

    // Handshake on boot
    socket.on('ack getting kicked', function (msg) {
        console.log("Ack");
        addedUser = false;
    });

    // Admin has kicked this group out
    socket.on('remove group', function (msg, callback) {
        if (msg == "" || msg >= groups.length || msg < 0) {
            callback("Error");
        } else {
            var usersToRemove = groups[msg].users.length;

            // Get rid of the user in the system
            for (var i = 0; i < groups[msg].users.length; i++) {
                var username = groups[msg].users[i].name;
                console.log("Deleting: " + username);
                delete users[username];
            }
            groups.splice(msg, 1);
            numUsers -= usersToRemove;

            // Tell them they're out
            io.to(msg).emit('kicked out', msg);

            // Update all references
            for (var i = msg; i < groups.length; i++) {
                for (var j = 0; j < groups[i].users.length; j++) {
                    var username = groups[i].users[j].name;
                    users[username].group--;
                    io.to(users[username].socketId).emit('change group subscription', users[username].group);
                }
            }

            callback({ numUsers: numUsers, groups: groups });
        }
    });

    // Admin has started the game
    socket.on('start game', function (callback) {
        var canStart = true;
        var gameEnded = false;
        if (gameStarted) {
            return callback({ err: "The game has already begun." });
        } else {
            if (numUsers == 0) {
                return callback({ err: "You need at least 4 people to play the game." });
            } else if (numUsers % 4 != 0) {
                return callback({ err: "You need to fill each group before you can start the game." });
            }

            gameStarted = true;
            callback({ numUsers: numUsers });

            for (var i = 0; i < groups.length; i++) {
                io.to(i).emit('game started', {
                    numUsers: numUsers,
                    week: 0
                });
                advanceTurn(i);
            }
        }
    });

    // Admin has reset a game already in progress
    socket.on('reset game', function (callback) {
        if (!gameStarted) {
            callback("Error");
        } else {
            gameStarted = false;
            gameEnded = false;
            resetGame();
            callback({ numUsers: numUsers, groups: groups });

            socket.broadcast.emit('game reset', {
                numUsers: numUsers,
                week: 0
            });
        }
    });

    // Admin has ended the game
    socket.on('end game', function (callback) {
        if (!gameStarted || gameEnded) {
            callback("Error");
        } else {
            gameEnded = true;
            callback({ numUsers: numUsers, groups: groups });

            socket.broadcast.emit('game ended', {
                numUsers: numUsers
            });
        }
    });

    // You've got an order from someone in a group
    socket.on('submit order', function (order, callback) {
        var user = users[socket.name];
        var group = groups[user.group];

        console.log("User: " + socket.name);
        console.log("Group: " + user.group);
        console.log("Order: " + order);

        // Push the order
        group.users[user.index].role.upstream.orders = parseInt(order);

        console.log("Remaining: " + group.waitingForOrders);

        // Reduce the list of outstanding orders
        var search_term = group.users[user.index].role.name;
        var index = group.waitingForOrders.indexOf(search_term);
        if (index !== -1) {
            group.waitingForOrders.splice(index, 1);
        }

        // Either advance the turn or we're waiting
        if (group.waitingForOrders.length == 0) {
            callback();
            advanceTurn(user.group);
        } else {
            callback(group.waitingForOrders);
            io.to(user.group).emit('update order wait', group.waitingForOrders);
        }
    });
});

// This is the server
http.listen(process.env.PORT || 3000, function () {
    console.log('Beer Distribution Game Simulator engaged! Listening...');
});

// This is where all the turn calculation happens... dragons live here
function advanceTurn(group) {
    var groupToAdvance = groups[group];

    // Initial turn, fill out the buffers
    if (groupToAdvance.week == 0) {
        groupToAdvance.waitingForOrders = BEER_NAMES;

        groupToAdvance.shipping = [];
        groupToAdvance.mailing = [];
        groupToAdvance.costHistory = [];

        for (var i = 0; i < 3; i++) {
            groupToAdvance.shipping.push([starting_throughput, starting_throughput]);
            groupToAdvance.mailing.push([starting_throughput]);
        }

        groupToAdvance.shipping.push([starting_throughput, starting_throughput]);
    }

    // Loop through all the roles
    for (var i = 0; i < groupToAdvance.users.length; i++) {
        console.log("\n " + groupToAdvance.week + " #####################\n");
        var curUser = groupToAdvance.users[i];

        if (groupToAdvance.week == 0) {
            curUser.inventoryHistory = [];
            curUser.backlogHistory = [];
            curUser.costHistory = [];
            curUser.orderHistory = [];
        }

        // Compute cost
        curUser.costHistory.push(curUser.cost);
        curUser.inventoryHistory.push(curUser.inventory);
        curUser.backlogHistory.push(curUser.backlog);

        console.log("[" + curUser.role.name + "] " + "Previous Shipment from Upstream <<<: " + curUser.role.upstream.shipments + " [" + groupToAdvance.shipping[i] + "]");
        curUser.role.upstream.shipments = groupToAdvance.shipping[i].shift();
        console.log("[" + curUser.role.name + "] " + "New Shipment from Upstream <<<: " + curUser.role.upstream.shipments + " [" + groupToAdvance.shipping[i] + "]");
        console.log("[" + curUser.role.name + "] " + "Previous Inventory: " + curUser.inventory);
        curUser.inventory += curUser.role.upstream.shipments;
        console.log("[" + curUser.role.name + "] " + "New Inventory: " + curUser.inventory);

        // If start, get order from customer directly
        if (i == 0) {
            if (groupToAdvance.week < 8) {
                curUser.role.downstream.orders = customer_demand[0];
            } else if (groupToAdvance.week < 19) {
                curUser.role.downstream.orders = customer_demand[1];
            } else if (groupToAdvance.week < 26) {
                curUser.role.downstream.orders = customer_demand[2];
            } else if (groupToAdvance.week < 39) {
                curUser.role.downstream.orders = customer_demand[3];
            } else {
                curUser.role.downstream.orders = customer_demand[4];
            }
            console.log("[" + curUser.role.name + "] " + " Customer Order >>>: " + curUser.role.downstream.orders);
        } else {
            // Otherwise the order is from the previous node
            console.log("[" + curUser.role.name + "] " + " Prev Downstream Order >>>: " + curUser.role.downstream.orders + " [" + groupToAdvance.mailing[i - 1] + "]");
            curUser.role.downstream.orders = groupToAdvance.mailing[i - 1].shift();
            console.log("[" + curUser.role.name + "] " + " New Downstream Order >>>: " + curUser.role.downstream.orders + " [" + groupToAdvance.mailing[i - 1] + "]");
        }

        var toShip = curUser.backlog + curUser.role.downstream.orders;
        console.log("[" + curUser.role.name + "] " + "To Ship <<<: " + toShip);
        curUser.role.downstream.shipments = (toShip > curUser.inventory ? curUser.inventory : toShip);
        console.log("[" + curUser.role.name + "] " + "Actually Shipped <<<: " + curUser.role.downstream.shipments);

        // Push the shipment back down the queue
        if (i != 0) {
            console.log("[" + curUser.role.name + "] " + "Prev Ship <<<: [" + groupToAdvance.shipping[i - 1] + "]");
            groupToAdvance.shipping[i - 1].push(curUser.role.downstream.shipments);
            console.log("[" + curUser.role.name + "] " + "Next Ship <<<: [" + groupToAdvance.shipping[i - 1] + "]");
        }

        console.log("[" + curUser.role.name + "] " + "Prev Backlog: " + curUser.backlog);
        curUser.backlog = (toShip > curUser.inventory) ? toShip - curUser.inventory : 0;
        console.log("[" + curUser.role.name + "] " + "New Backlog: " + curUser.backlog);
        curUser.inventory = (toShip > curUser.inventory) ? 0 : curUser.inventory - toShip;
        console.log("[" + curUser.role.name + "] " + "New Inventory: " + curUser.inventory);

        // First turn
        if (groupToAdvance.week == 0) {
            curUser.role.upstream.orders = starting_throughput;
        }
        console.log("[" + curUser.role.name + "] " + "Upstream Order >>>: " + curUser.role.upstream.orders);

        // If it's the factory, push the order into the production queue, otherwise mail the order
        if (i == 3) {
            console.log("[" + curUser.role.name + "] " + "Prev Mail >>>: [" + groupToAdvance.shipping[i] + "]");
            groupToAdvance.shipping[i].push(curUser.role.upstream.orders);
            console.log("[" + curUser.role.name + "] " + "Next Mail >>>: [" + groupToAdvance.shipping[i] + "]");
        } else {
            console.log("[" + curUser.role.name + "] " + "Prev Mail >>>: [" + groupToAdvance.mailing[i] + "]");
            groupToAdvance.mailing[i].push(curUser.role.upstream.orders);
            console.log("[" + curUser.role.name + "] " + "Next Mail >>>: [" + groupToAdvance.mailing[i] + "]");
        }

        curUser.orderHistory.push(curUser.role.upstream.orders);
        groupToAdvance.cost += curUser.cost;

        console.log("[" + curUser.role.name + "] " + "Cost Pushed: $" + curUser.cost);
        curUser.cost += curUser.inventory * inventory_cost + curUser.backlog * backlog_cost;
        console.log("[" + curUser.role.name + "] " + "New Cost: $" + curUser.cost);

        console.log("\n#####################\n");
    }

    groupToAdvance.costHistory.push(groupToAdvance.cost);

    // Next week
    groupToAdvance.week++;
    groupToAdvance.waitingForOrders = JSON.parse(JSON.stringify(BEER_NAMES));

    // Message to each user
    for (var i = 0; i < groupToAdvance.users.length; i++) {
        // Time to let the person know
        io.to(groupToAdvance.users[i].socketId).emit('next turn', {
            numUsers: numUsers,
            week: groupToAdvance.week,
            update: groupToAdvance.users[i]
        });
    }

    io.to("admins").emit('update group', { groupNum: group, groupData: groupToAdvance, numUsers: numUsers });
}

// Reset the game
function resetGame() {
    for (var i = 0; i < groups.length; i++) {
        groups[i].week = 0;
        groups[i].cost = 0;

        roles = JSON.parse(JSON.stringify(BEER_ROLES));
        // Reset all the users
        for (var j = 0; j < groups[i].users.length; j++) {
            groups[i].users[j].role = roles.shift();
            groups[i].users[j].cost = 0;
            groups[i].users[j].inventory = starting_inventory;
            groups[i].users[j].backlog = 0;
        }
    }
}

// Register a user
function registerUser(socketId, userName) {
    console.log(users);
    // Does the user already exist? If so, verify it's a disconnect
    if (users[userName]) {
        var user = users[userName];
        if (user.socketId) return null;

        groups[user.group].users[user.index].socketId = socketId;
        user.socketId = socketId;
        return users[userName];
    }

    if (gameStarted) return null;

    // Okay, get them a role
    if (roles.length == 0) roles = JSON.parse(JSON.stringify(BEER_ROLES));
    var userRole = roles.shift();

    // Assign them to a group
    if (groups.length == 0) groups.push({ week: 0, cost: 0, users: [] });
    var lastGroup = groups[groups.length - 1];

    var user = { "name": userName, "socketId": socketId, "cost": 0, "inventory": starting_inventory, "backlog": 0, "role": userRole };
    if (lastGroup.users.length < 4) {
        lastGroup.users.push(user);
    } else {
        var newGroup = { week: 0, cost: 0, users: [] };
        newGroup.users.push(user);
        groups.push(newGroup);
    }

    var userLookup = { "name": userName, "socketId": socketId, "group": groups.length - 1, "index": groups[groups.length - 1].users.length - 1 };
    // Let's update our big table
    console.log(user);
    users[userName] = userLookup;
    return userLookup;
}