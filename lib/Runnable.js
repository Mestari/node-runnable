/**
 * Runnable
 */

var cluster = require('cluster');

/**
 * Create threaded instance
 *
 * @param masterTitle
 * @param workerTitle
 * @param uid
 * @param gid
 * @param workersNum
 */
function Runnable(
    masterTitle,
    workerTitle,
    uid,
    gid,
    workersNum
) {
    this.masterTitle = masterTitle;
    this.workerTitle = workerTitle;
    this.uid = uid;
    this.gid = gid;
    this.workersNum = workersNum || Runnable.DEFAULT_WORKERS_NUM;
}

/**
 * Default number of workers
 *
 */
Runnable.DEFAULT_WORKERS_NUM = 1;

Runnable.EVENT_STOP = 'SIGTERM';
Runnable.EVENT_KILL = 'SIGKILL';
Runnable.EVENT_RESTART = 'SIGUSR1';
Runnable.EVENT_INFO = 'SIGUSR2';

Runnable.prototype = {

    /**
     * Iterate over workers
     *
     * @param callback
     */
    eachWorker: function(callback) {
        for (var id in cluster.workers) {
            callback(cluster.workers[id]);
        }
    },

    stopWokers: function() {
        var self = this;

        self.eachWorker(function(worker) {
            worker.send({
                text: 'shutdown',
                from: 'master'
            });

            setTimeout(function() {
                if(worker) {
                    worker.kill(Runnable.EVENT_KILL);
                }
            }, 5000);
        });
    },

    /**
     * Attach actions to events and signals
     *
     */
    attachListeners: function() {

        var self = this;

        process.on(Runnable.EVENT_STOP, function() {
            if (cluster.isMaster) {
                self.stopWokers();
            }
            self.stop();
        });

        process.on(Runnable.EVENT_RESTART, function() {
            if (cluster.isMaster) {
                self.stopWorkers();
            }
            self.restart();
        });

        process.on(Runnable.EVENT_INFO, function() {
            if (cluster.isMaster) {
                self.eachWorker(function(worker) {
                    process.kill(worker, Runnable.EVENT_INFO);
                });
            }
            self.processInfo();
        });

        process.on('message', function(message) {
            if(message.type === 'shutdown') {
                process.exit(0);
            }
        });

        if (cluster.isMaster) {
            cluster.on('exit', function(worker, code, signal) {
                console.log('Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
                if (worker.exitedAfterDisconnect !== true) {
                    console.log('Starting a new worker');
                    cluster.fork();
                }
            });

            cluster.on('online', function(worker) {
                console.log('Worker ' + worker.process.pid + ' is online');
            });
        }

        return this;
    },

    /**
     * Set process attributes
     *
     */
    setProcessAttributes: function() {
        var title = cluster.isMaster ? this.masterTitle : this.workerTitle;

        if (title) {
            process.title = title;
        }

        if (this.gid) {
            process.setgid(this.gid);
        }

        if (this.uid) {
            process.setuid(this.uid);
        }
    },

    /**
     * Initialize global objects
     *
     */
    init: function() {
        this.attachListeners();

        try {
            this.setProcessAttributes();
        } catch (e) {
            console.warn('Failed to set process attributes: ' + e.message);
        }

        if (cluster.isMaster) {

            return this;
        }

        if (typeof this.initWorker == 'function') {
            this.initWorker();
        }

        return this;
    },

    /**
     * Work workers
     *
     */
    fork: function() {
        for (var i = 0; i < this.workersNum; i++) {
            cluster.fork();
        }

        return this;
    },

    /**
     * Start application
     *
     */
    start: function() {
        this.init();

        if (cluster.isMaster) {

            this.fork();

            if (typeof this.initMaster == 'function') {
                this.initMaster();
            }

            return this;
        }

        if (typeof this.startWorker == 'function') {
            this.startWorker();
        }

        return this;
    },

    /**
     * Stop application
     *
     */
    stop: function(keepMaster) {
        if (!keepMaster && cluster.isMaster) {
            process.exit();

            return this;
        }

        process.exit();

        return this;
    },

    /**
     * Restart application
     *
     */
    restart: function() {
        this.stop(true);

        if (cluster.isMaster) {
            this.fork();
        }

        return this;
    },

    /**
     * Print process info
     *
     */
    processInfo: function() {
        console.info(
            'PID (' + process.title + '): ' + process.pid
            + ': memory usage: ' + JSON.stringify(process.memoryUsage())
            + '; uptime: ' + process.uptime()
        );
    }

};

module.exports = Runnable;
