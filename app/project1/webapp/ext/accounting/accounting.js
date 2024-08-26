sap.ui.define([
    "sap/m/MessageBox",
    "sap/ui/core/library",
    "sap/ui/core/BusyIndicator",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text"
], function (MessageBox, coreLibrary, BusyIndicator, MessageToast, Dialog, Button, Text) {
    "use strict";

    return {
        fetchRecords: async function (oBindingContext, aSelectedContexts) {
            try {
                // Attempt to fetch the total record count from the API
                const countResponse = await $.ajax({
                    url: "http://localhost:4004/odata/v4/accounting-document/accounting/$count", // Adjust the API endpoint as needed
                    method: "GET",
                    dataType: "text" // Expect plain text for count
                });

                // Convert the count response to a number
                var totalRecords = parseInt(countResponse, 10);
                if (isNaN(totalRecords) || totalRecords <= 0) {
                    MessageBox.error("Failed to fetch the total record count or count is 0.");
                    return;
                }

                var batchSize = 2000; // Define batch size
                var totalBatches = Math.ceil(totalRecords / batchSize);
                var chunkSize = 1000; // Define chunk size for updating progress

                function updateProgressDialog(currentRecord, totalRecords, oDialog) {
                    oDialog.getContent()[0].setText("Processing record " + currentRecord + " /" + totalRecords + "...");
                }

                function processChunk(batchNumber, start, end, totalRecords, chunkStart, oDialog) {
                    var chunkEnd = Math.min(chunkStart + chunkSize - 1, end);

                    updateProgressDialog(chunkStart, totalRecords, oDialog);

                    $.ajax({
                        url: "/odata/v4/accounting-document/fetchRecords",
                        type: "POST",
                        contentType: "application/json",
                        data: JSON.stringify({
                            context: oBindingContext,
                            selectedContexts: aSelectedContexts,
                            batchStart: chunkStart,
                            batchEnd: chunkEnd
                        }),
                        success: function (result) {
                            console.log("Processed chunk starting at " + chunkStart + " successfully.", result);

                            if (chunkEnd < end) {
                                // Continue processing the next chunk
                                processChunk(batchNumber, start, end, totalRecords, chunkEnd + 1, oDialog);
                            } else {
                                // Finish processing the current batch
                                if (batchNumber < totalBatches) {
                                    MessageBox.confirm("Batch " + batchNumber + " completed. Do you want to process the next batch?", {
                                        actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                                        onClose: function (sAction) {
                                            if (sAction === MessageBox.Action.YES) {
                                                processBatch(batchNumber + 1, end + 1, Math.min(end + batchSize, totalRecords), totalBatches, totalRecords, oDialog);
                                            } else {
                                                oDialog.close();
                                                BusyIndicator.hide();
                                            }
                                        }
                                    });
                                } else {
                                    // All batches processed
                                    oDialog.close();
                                    new Dialog({
                                        title: "Success",
                                        type: "Message",
                                        state: "Success",
                                        content: new Text({ text: "All batches processed successfully." }),
                                        beginButton: new Button({
                                            text: "OK",
                                            press: function () {
                                                this.getParent().close();
                                            }
                                        }),
                                        afterClose: function () {
                                            this.destroy();
                                        }
                                    }).open();
                                    BusyIndicator.hide();
                                }
                            }
                        },
                        error: function (xhr, status, error) {
                            console.error("Error processing chunk starting at " + chunkStart + ":", error);
                            MessageBox.error("Failed to process chunk starting at " + chunkStart + ". Status: " + xhr.status + ", Error: " + xhr.responseText);
                            oDialog.close();
                            BusyIndicator.hide();
                        }
                    });
                }

                function processBatch(batchNumber, start, end, totalBatches, totalRecords, oDialog) {
                    updateProgressDialog(start, totalRecords, oDialog);

                    // Process chunks within the batch
                    processChunk(batchNumber, start, end, totalRecords, start, oDialog);
                }

                MessageBox.confirm("Do you want to start fetching data?", {
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.YES) {
                            BusyIndicator.show(0);
                            var oDialog = new Dialog({
                                title: "Batch Processing Progress",
                                type: "Message",
                                content: new Text({ text: "Initializing..." }),
                                beginButton: new Button({
                                    text: "Cancel",
                                    press: function () {
                                        oDialog.close();
                                        BusyIndicator.hide();
                                    }
                                }),
                                afterClose: function () {
                                    oDialog.destroy(); // Clean up the dialog
                                }
                            });
                            oDialog.open();

                            processBatch(1, 1, Math.min(batchSize, totalRecords), Math.ceil(totalRecords / batchSize), totalRecords, oDialog);
                        }
                    }
                });
            } catch (error) {
                console.error("Error fetching initial record count:", error);
                MessageBox.error("Error fetching initial record count: " + (error.message || "Unknown error"));
            }
        }
    };
});
