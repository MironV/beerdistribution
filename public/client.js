/* ========================================================================
 * Beer Distribution Game Simulator: client.js
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

var socket = io();

var curWeek = 0;
var curUser = null;
var numUsers = 0;
var submittedOrder = false;
var userIdx = 0;
var curGroup;
var gameEnded = false;

var countOptions = {
    useEasing: true,
    useGrouping: true,
    separator: ',',
    decimal: '.',
    prefix: '',
    suffix: ''
};

// Login
$(document).ready(function () {
    $('#board').hide();
    $('#myModal').modal('show');

    // Dialog for logging in
    $("#btnLogin").click(function (event) {
        event.preventDefault();
        if ($(this).hasClass("disabled")) return;
        var username = $('#formUsername').val();
        socket.emit('submit username', username, function (msg) {
            console.log(msg);
            if (msg == "Invalid Username") {
                $('#errorText').text('That username is already in use! Please pick a different username.');
                $('#errorDialog').show();
            } else if (msg == "Game Started") {
                $('#errorText').text('This game has already begun, no new users can be added.');
                $('#errorDialog').show();
            } else {
                userIdx = msg.idx;
                curGroup = msg.group;
                curUser = msg.group.users[userIdx];
                curWeek = msg.group.week;
                numUsers = msg.numUsers;
                gameEnded = msg.gameEnded;

                $('#formUsername').val('');
                $('#errorDialog').hide();
                $('#myModal').modal('hide');
                $('#role').text('Your Role: ' + curUser.role.name);
                $('#username').text('Signed in as ' + curUser.name);

                if (curWeek > 0 && !gameEnded) {
                    nextTurn(numUsers, curWeek, curUser);
                    if (curGroup.waitingForOrders.length > 0) {
                        submittedOrder = true;
                        $("#formOrderAmount").val(curUser.role.upstream.orders);
                        $("#btnOrder").attr("disabled", true);
                        $("#formOrderAmount").attr("disabled", true);
                        updateWait();
                    }
                    $('#board').show();
                    $('#lobby').hide();
                } else if (gameEnded) {
                    updateStatus();
                    updateTable(true);
                } else {
                    updateStatus();
                    updateTable(false);
                }
            }
        });
    });

    // Submitting an order
    $("#btnOrder").click(function () {
        event.preventDefault();
        if ($(this).hasClass("disabled")) return;
        var orderAmount = $('#formOrderAmount').val();

        var curCost = parseInt($('#cstAmt').text());
        var costCount = new CountUp("cstAmt", curCost, parseFloat(curUser.cost).toFixed(0), 0, 3, countOptions);
        costCount.start();

        socket.emit('submit order', orderAmount, function (msg) {
            submittedOrder = true;
            $('#newOrder').fadeOut("fast");
            $("#btnOrder").attr("disabled", true);
            $("#formOrderAmount").attr("disabled", true);
            updateWait(msg);
        });
    });

    // Accepting a delivery
    $("#btnDeliver").click(function () {
        $('#acceptDelivery').fadeOut("fast");
        $('#upstreamShipments').addClass('animated bounceInRight');
        $('#upstreamShipments').one('webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend', function () {
            $('#upstreamShipments').removeClass('animated bounceInRight');
            $('#curInventory').addClass('animated bounce');
            $('#curInventory').one('webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend', function () {
                $('#curInventory').removeClass('animated bounce');
                var curInventory = parseInt($('#inventoryAmt').text());
                var inventoryCount = new CountUp("inventoryAmt", curInventory, curInventory + curUser.role.upstream.shipments, 0, 2, countOptions);
                var shipmentCount = new CountUp("usShpAmt", curUser.role.upstream.shipments, 0, 0, 2, countOptions);
                shipmentCount.start();
                inventoryCount.start(function () {
                    $('#fulfillText').text("The " + curUser.role.downstream.name + " is waiting for their order. You'll want to fulfill as much as you can!");
                    $('#fulfillOrder').fadeIn("fast");
                });
            });
        });
    });

    // Fulfilling an order
    $("#btnFulfill").click(function () {
        $('#fulfillOrder').fadeOut("fast");
        $('#downstreamOrders').addClass('animated bounceInLeft');
        $('#downstreamOrders').one('webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend', function () {
            $('#downstreamOrders').removeClass('animated bounceInLeft');
            $('#curInventory').addClass('animated bounce');
            $('#curInventory').one('webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend', function () {
                $('#curInventory').removeClass('animated bounce');
                var curInventory = parseInt($('#inventoryAmt').text());
                var inventoryCount = new CountUp("inventoryAmt", curInventory, curUser.inventory, 0, 2, countOptions);

                var curBacklog = parseInt($('#bklgAmt').text());
                var backlogCount = new CountUp("bklgAmt", curBacklog, curUser.backlog, 0, 2, countOptions);
                var shipmentCount = new CountUp("dsShpAmt", 0, curUser.role.downstream.shipments, 0, 2, countOptions);

                var orderCountdown = new CountUp("dsOrdrAmt", curUser.role.downstream.orders, 0, 0, 3, countOptions);

                backlogCount.start();
                inventoryCount.start();
                orderCountdown.start();

                shipmentCount.start(function () {
                    $('#downstreamShipments').addClass('animated bounce');
                    $('#downstreamShipments').one('webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend', function () {
                        $('#downstreamShipments').removeClass('animated bounce');
                        $('#downstreamShipments').addClass('animated bounceOutLeft');
                        $('#downstreamShipments').one('webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend', function () {
                            $('#downstreamShipments').removeClass('animated bounceOutLeft');

                            if (curUser.role.name == "National/Donor") {
                                $('#orderText').text("Time to place an order for the production line. Fill out the order form below to place an order.");
                            } else {
                                $('#orderText').text("Time to order from the " + curUser.role.upstream.name + ". Fill out their order form below to place an order.");
                            }

                            $('#newOrder').fadeIn("fast");
                            $("#btnOrder").attr("disabled", false);
                            $("#formOrderAmount").attr("disabled", false);
                        });
                    });
                });
            });
        });
    });

    // Go to the next turn
    $('#nextTurn').on('hidden.bs.modal', function (e) {
        if (curWeek != 0 && !gameEnded) {
            $('#formOrderAmount').val('');

            var shipmentCount = new CountUp("usShpAmt", 0, curUser.role.upstream.shipments, 0, 3, countOptions);
            shipmentCount.start();

            var orderCount = new CountUp("dsOrdrAmt", 0, curUser.role.downstream.orders, 0, 3, countOptions);
            orderCount.start();

            // This is a bit hacky because it depends on how you call the roles :(
            if (curUser.role.name == "Factory") {
                $('#deliveryText').text("You have a new delivery from the production line. Accept it to get started!");
            } else {
                $('#deliveryText').text("You have a new delivery from the " + curUser.role.upstream.name + ". Accept it to get started!");
            }

            $('#acceptDelivery').fadeIn("fast");
        }
    });
});

// Update the # of users in real time
socket.on('user joined', function (msg) {
    numUsers = msg.numUsers;
    updateStatus();
});

// Update the # of users in real time
socket.on('user left', function (msg) {
    numUsers = msg.numUsers;
    updateStatus();
});

// Kicked out of the group
socket.on('change group subscription', function (msg) {
    socket.emit('change group', msg);
});

// You were kicked out by the admin
socket.on('kicked out', function (msg) {
    socket.emit('ack getting kicked');

    resetUser();

    hideGameBoard();

    $('#myModal').modal('show');
});

// Someone joined your specific group
socket.on('group member joined', function (msg) {
    curGroup.users[msg.idx] = msg.update;
    $('#grouptable > tbody > tr').each(function (i) {
        if (msg.idx == i) {
            $(this).html('<td>' + (i + 1) + '</td><td>' + (msg.idx == userIdx ? curGroup.users[i].name : 'Player ' + (i + 1)) + '</td><td>' + msg.update.role.name + '</td>');

            if (msg.update.socketId) {
                $(this).removeClass("danger");
            }
        }
    });
});

// Someone left your specific group
socket.on('group member left', function (msg) {
    $('#grouptable > tbody > tr').each(function (i) {
        if (msg.idx == i && !msg.update.socketId && msg.idx != userIdx) {
            $(this).html('<td>' + (i + 1) + '</td><td>Player ' + (i + 1) + ' (Disconnected)</td><td>' + msg.update.role.name + '</td>');
            $(this).addClass("danger");
        }
    });
});

// Since this is real time, we must wait on others before advancing to the next week
function updateWait(msg) {
    if (msg && submittedOrder) {
        var listOfUsers = "";
        for (var i = 0; i < msg.length; i++) {
            if (i != 0 && i != msg.length - 1 && msg.length > 1) listOfUsers += ", ";
            if (i == msg.length - 1 && msg.length > 1) listOfUsers += " and ";
            listOfUsers += msg[i];
        }

        $('#waitingText').text("Your order was submitted. We are currently waiting on " + listOfUsers + " to submit an order.");
        $('#waitingOnUsers').fadeIn("fast");
    } else {
        $('#waitingOnUsers').fadeOut("fast");
    }
}

// Updates the table in real time
function updateTable(showNames) {
    $('#grouptable > tbody > tr').each(function (i) {
        if (curGroup.users[i] && i != userIdx) {
            if (curGroup.users[i].socketId) {
                $(this).removeClass("danger");
                $(this).html('<td>' + (i + 1) + '</td><td>' + (showNames ? curGroup.users[i].name : 'Player ' + (i + 1)) + '</td><td>' + curGroup.users[i].role.name + '</td>');
            } else {
                if (curGroup.users[i].role.name) {
                    $(this).html('<td>' + (i + 1) + '</td><td>' + (showNames ? curGroup.users[i].name : 'Player ' + (i + 1)) + ' (Disconnected)</td><td>' + curGroup.users[i].role.name + '</td>');
                    $(this).addClass("danger");
                } else {
                    $(this).html('<td>' + (i + 1) + '</td><td>Waiting...</td><td>' + curGroup.users[i].role.name + '</td>');
                    $(this).removeClass("danger");
                }
            }
        }

        if (i == userIdx) {
            $(this).html('<td>' + (i + 1) + '</td><td>' + curGroup.users[i].name + '</td><td>' + curGroup.users[i].role.name + '</td>');
            $(this).addClass("active");
        }
    });
}

// Reset everything about the user in case the game is reset
function resetUser() {
    curWeek = 0;
    curUser = null;
    numUsers = 0;
    submittedOrder = false;
    userIdx = 0;
    curGroup = null;
    gameEnded = false;

    $('#grouptable > tbody > tr').each(function (i) {
        $(this).removeClass("danger");
        $(this).html('<td>' + (i + 1) + '</td><td>Waiting...</td><td></td>');
    });
}

// Updates the status message to reflect the state of the game
function updateStatus() {
    if (numUsers == 1) {
        var numParticipants = "There is currently 1 participant.";
    } else {
        var numParticipants = 'There are currently ' + numUsers + ' participants.';
    }

    if (curWeek > 0 && !gameEnded) {
        $('#participants').text('The game has started. You are in Week ' + curWeek + ". " + numParticipants);
    } else if (!gameEnded) {
        $('#participants').text('We are waiting for the game to start. ' + numParticipants);
    } else {
        $('#participants').text('The game has ended. You finished in  Week ' + curWeek + ". " + numParticipants);
    }
}

// Next turn (week) logic
function nextTurn(users, week, user) {
    curUser = user;
    numUsers = users;
    curWeek = week;

    updateStatus();

    $('#downstreamRole').text(curUser.role.downstream.name);
    $('#upstreamRole').text(curUser.role.upstream.name);
    $('#userRole').text(curUser.role.name + " (You)");

    $('#dsShpAmt').text('0');

    if (curWeek > 0) {
        $('#cstAmt').text(parseFloat(curUser.costHistory[curWeek - 1]).toFixed(0));
        $('#inventoryAmt').text(curUser.inventoryHistory[curWeek - 1]);
        $('#bklgAmt').text(curUser.backlogHistory[curWeek - 1]);
    } else {
        $('#cstAmt').text('0');
    }

    $("#btnOrder").attr("disabled", true);
    $("#formOrderAmount").attr("disabled", true);

    $("span.weekText").text("Week " + week);
    $("span.upstreamName").text(curUser.role.upstream.name);
    $("span.downstreamName").text(curUser.role.downstream.name);

    $('#nextTurn').modal('show');
}

// The game board disappears when the game is over
function hideGameBoard() {
    $('#board').hide();
    $('#nextTurn').modal('hide');

    $('#waitingOnUsers').hide();
    $('#acceptDelivery').hide();
    $('#fulfillOrder').hide();
    $('#newOrder').hide();
}

// React to the game starting (setup the UI)
socket.on('game started', function (msg) {
    nextTurn(msg.numUsers, msg.week, curUser);
    gameEnded = false;

    $('#board').show();
    $('#lobby').hide();
});

// React to the game ending (go to lobby)
socket.on('game reset', function (msg) {
    gameEnded = false;
    $('#lobby').show();
    curWeek = msg.week;
    numUsers = msg.numUsers;

    hideGameBoard();

    updateTable(false);
    updateStatus();
});

// React to the game ending (go to lobby)
socket.on('game ended', function (msg) {
    gameEnded = true;
    $('#lobby').show();
    numUsers = msg.numUsers;

    hideGameBoard();

    updateTable(true);
});

// Got a message that someone in the group sent an order
socket.on('update order wait', function (msg) {
    updateWait(msg);
});

// Go to the next turn
socket.on('next turn', function (msg) {
    console.log(msg);

    $('#waitingOnUsers').fadeOut("fast");
    submittedOrder = false;

    nextTurn(msg.numUsers, msg.week, msg.update);
});