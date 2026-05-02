// performance.js

// FPS Monitor
let lastFrameTime = performance.now();
let fps = 0;
let frames = 0;

function updateFPS() {
    const currentTime = performance.now();
    frames++;
    if (currentTime - lastFrameTime >= 1000) {
        fps = frames;
        frames = 0;
        lastFrameTime = currentTime;
        console.log(`FPS: ${fps}`);
    }
}

// Object Pooling for Bullets
class Bullet {
    constructor() {
        this.active = false;
    }
    activate() {
        this.active = true;
    }
    deactivate() {
        this.active = false;
    }
}

class BulletPool {
    constructor(size) {
        this.pool = [];
        for (let i = 0; i < size; i++) {
            this.pool.push(new Bullet());
        }
    }

    getBullet() {
        const bullet = this.pool.find(b => !b.active);
        if (bullet) {
            bullet.activate();
            return bullet;
        }
        return null; // All bullets are in use
    }

    releaseBullet(bullet) {
        bullet.deactivate();
    }
}

// Object Pooling for Enemies
class Enemy {
    constructor() {
        this.active = false;
    }
    activate() {
        this.active = true;
    }
    deactivate() {
        this.active = false;
    }
}

class EnemyPool {
    constructor(size) {
        this.pool = [];
        for (let i = 0; i < size; i++) {
            this.pool.push(new Enemy());
        }
    }

    getEnemy() {
        const enemy = this.pool.find(e => !e.active);
        if (enemy) {
            enemy.activate();
            return enemy;
        }
        return null; // All enemies are in use
    }

    releaseEnemy(enemy) {
        enemy.deactivate();
    }
}

// Quadtree for Spatial Optimization
class Quadtree {
    constructor(boundary, capacity) {
        this.boundary = boundary; // {x, y, width, height}
        this.capacity = capacity;
        this.points = [];
        this.divided = false;
    }

    subdivide() {
        const { x, y, width, height } = this.boundary;
        const nw = new Quadtree({ x, y, width: width / 2, height: height / 2 }, this.capacity);
        const ne = new Quadtree({ x: x + width / 2, y, width: width / 2, height: height / 2 }, this.capacity);
        const sw = new Quadtree({ x, y: y + height / 2, width: width / 2, height: height / 2 }, this.capacity);
        const se = new Quadtree({ x: x + width / 2, y: y + height / 2, width: width / 2, height: height / 2 }, this.capacity);
        this.northwest = nw;
        this.northeast = ne;
        this.southwest = sw;
        this.southeast = se;
        this.divided = true;
    }

    insert(point) {
        if (!this.contains(point)) return false;
        if (this.points.length < this.capacity) {
            this.points.push(point);
            return true;
        }
        if (!this.divided) this.subdivide();
        return (this.northwest.insert(point) || this.northeast.insert(point) || this.southwest.insert(point) || this.southeast.insert(point));
    }

    contains(point) {
        return (point.x >= this.boundary.x && point.x < this.boundary.x + this.boundary.width &&
                point.y >= this.boundary.y && point.y < this.boundary.y + this.boundary.height);
    }
}