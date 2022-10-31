import "./style.css";
import { fromEvent, interval, merge} from 'rxjs'; 
import { map, filter, scan} from 'rxjs/operators';

type Key = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'
type Event = 'keydown' | 'keyup'

// Assignment 1, Yo Kogure, 32134541. 
// I apologize for the late submission and causing troubles 

// References, details and further documentations on the design are compiled inside the report.
function main() {
  /**
   * Inside this function you will use the classes and functions from rx.js
   * to add visuals to the svg element in pong.html, animate them, and make them interactive.
   *
   * Study and complete the tasks in observable examples first to get ideas.
   *
   * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
   *
   * You will be marked on your functional programming style
   * as well as the functionality that you implement.
   *
   * Document your code!
   */

  /**
   * This is the view for your game to add and update your game elements.
   */
  const svg = document.querySelector("#svgCanvas") as SVGElement & HTMLElement;

  // The design is to have 4 rows of ground, 3 rows of safe zone, 4 rows of river and 1 row of goal
  /**
   * A list of constants to use in game
   */
  const Constants = {
    // Constants in capital letters as guided, variables in camelCase
    CANVAS_SIZE: 600,
    INTERVAL: 1000,
    N_Y: 12, // shows max number of y in numbers
    N_X: 12, // show the max number of y axis grid
    GRID_SIZE: 50, // 50 px for one grid
    SCORE_GAIN: 10, // gains 10 scoere per grid
    AVG_SPEED: 1, // average speed of plank and cars
    // Coordinates below are self-explanatory
    FROG_INIT_X: 6,
    FROG_INIT_Y: 11,
    GOAL_CORD_X: 6,
    GOAL_CORD_Y: 0,
    SCORE_X: 10,
    SCORE_Y: 25,
    MESSAGE_X: 400,
    MESSAGE_Y: 25
  } as const

  type Cord_X = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 
  type Cord_Y = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 // 0 - 11, including start and goal

  type ViewType = 'plank' | 'car' | 'turtle' | 'crocodile' | 'goal' | 'wall' 
  type Environment = 'ground' | 'river' | 'safezone' | 'goal'
  type Direction = 'null' | 'left' | 'right' | 'up' | 'down' // 0, 1, 2, 3, 4 respectively?

  // constructors to use for action from observables
  class Tick { constructor(public readonly elapsed:number) {} }
  class Move { constructor(public readonly direction:Direction, public readonly distance:number) {}}

  // Below are how it defined streams of observables. Referred mostly to the Asteroid example.
  const 
    gameClock = interval(Constants.INTERVAL)
      .pipe(map(elapsed=>new Tick(elapsed))),

    keyObservable = <T>(e:Event, k:Key, result:()=>T)=>
      fromEvent<KeyboardEvent>(document,e)
        .pipe(
          filter(({code})=>code === k),
          filter(({repeat})=>!repeat),
          map(result)),

    startLeftMove = keyObservable('keydown', 'ArrowLeft',()=>new Move('left', 1)), // keydown on arrow leads to this move, 1 grid
    startRightMove = keyObservable('keydown', 'ArrowRight',()=>new Move('right', 1)),
    startUpMove = keyObservable('keydown', 'ArrowUp',()=>new Move('up', 1)),
    startDownMove = keyObservable('keydown', 'ArrowDown',()=>new Move('down', 1)),

    stopLeftMove = keyObservable('keydown', 'ArrowLeft',()=>new Move('left', 0)), // keyup on arrow leads to stopping, 0
    stopRightMove = keyObservable('keydown', 'ArrowRight',()=>new Move('right', 0)),
    stopUpMove = keyObservable('keydown', 'ArrowUp',()=>new Move('up', 0)),
    stopDownMove = keyObservable('keydown', 'ArrowDown',()=>new Move('down', 0))


    /**
     * An interface for obstacles. They include plank, cars and goals just to name some examples.
     * It contains information necessary for handling and moving these obstacles
     */
  interface Obstacle{
    id: string,
    x: Cord_X, // make sure they are in 0-11, not just numbers
    y: Cord_Y,
    viewType: ViewType,
    speed: number, // how many grids to move in one tick
    direction: Direction,
    touchable: 'pass' | 'win' | 'lose' // action to take when it is hit with the frog
    environment: Environment, // shows the environment (row) that the obstacle is in, such as river and ground
  }

  // This function creates a new obstacle. It takes in all parameters except for id
  const createObstacles = (    
    y: Cord_Y, // having y axis first is more user friendly when initializing
    x: Cord_X, 
    viewType: ViewType,
    speed: number,
    direction: Direction,
    touchable: 'pass' | 'win' | 'lose',
    environment: Environment): Obstacle=> { // This part initializes the ID, combining viewType and x and y axis
      return {id:''.concat(viewType, String(x), String(y)), x, y, viewType, speed, direction, touchable, environment} as Obstacle
    }


  /**
   * This states the type for each State. In my state management, the game updates state in each process, and refresh it when
   * it needs the new game
   */
  type State = Readonly<{
    frogWon: "won" | "lost" | "ongoing", // indicate whether the frog has won, lost, or still not decided
    currentScore: number,
    highestScore: number,
    highestRow: number, // row counter to know that frog reaches new floor. Shows the maximum y cord it reached
    frogCordX: Cord_X,
    frogCordY: Cord_Y,
    difficulty: number,
    obstacles: Readonly<Obstacle>[], // This is an array containing all obstacles in the game. equals to ReadonlyArray<Obstacle>
  }>
  
  /**
   * This is the initialState, the state when a new game has started. For this part, we have to manually code
   * Where we want to place the obstacles. This is the only part where we have to adjust.
   */
  const initialState: State ={
    frogWon: "ongoing",
    currentScore: 0,
    highestScore: 0,
    highestRow: 0, // row counter
    frogCordX: Constants.FROG_INIT_X,
    frogCordY: Constants.FROG_INIT_Y,
    difficulty: 1,
    obstacles: [
      // 1 goal, 4 river, 1 safezone, 2 ground, 1 safezone, 2 ground, 1 safezone in the order from y = 0-11
      createObstacles(Constants.GOAL_CORD_Y, Constants.GOAL_CORD_X, 'goal', 0, 'null', 'win', 'goal'),  // the goal

      // we start creating from y value 0, then incrementing.

      createObstacles(1, 2, 'plank', 1, 'left', 'pass', 'river'), // let it pass for plank
      createObstacles(1, 3, 'plank', 1, 'left', 'pass', 'river'), // consequtive x means that it is wide plank
      createObstacles(1, 4, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(1, 5, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(1, 9, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(1, 10, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(1, 11, 'plank', 1, 'left', 'pass', 'river'),

      createObstacles(2, 1, 'plank', 2, 'right', 'pass', 'river'), // this moves to right at a speed of 2 grid per tick
      createObstacles(2, 2, 'plank', 2, 'right', 'pass', 'river'),
      createObstacles(2, 3, 'plank', 2, 'right', 'pass', 'river'),
      createObstacles(2, 4, 'plank', 2, 'right', 'pass', 'river'),
      createObstacles(2, 6, 'plank', 2, 'right', 'pass', 'river'),
      createObstacles(2, 7, 'plank', 2, 'right', 'pass', 'river'),
      createObstacles(2, 8, 'plank', 2, 'right', 'pass', 'river'),
      createObstacles(2, 9, 'plank', 2, 'right', 'pass', 'river'),
      createObstacles(2, 10, 'plank', 2, 'right', 'pass', 'river'),
      createObstacles(2, 11, 'plank', 2, 'right', 'pass', 'river'),

      createObstacles(3, 3, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(3, 4, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(3, 5, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(3, 7, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(3, 10, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(3, 11, 'plank', 1, 'left', 'pass', 'river'),

      createObstacles(4, 2, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(4, 3, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(4, 4, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(4, 9, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(4, 10, 'plank', 1, 'left', 'pass', 'river'),
      createObstacles(4, 11, 'plank', 1, 'left', 'pass', 'river'),

      //safezone row 5

      createObstacles(6, 3, 'car', 2, 'left', 'lose', 'ground'), // let frog lose when hit with car
      createObstacles(6, 7, 'car', 2, 'left', 'lose', 'ground'),
      createObstacles(6, 11, 'car', 2, 'left', 'lose', 'ground'),

      createObstacles(7, 1, 'car', 1, 'right', 'lose', 'ground'),
      createObstacles(7, 10, 'car', 1, 'right', 'lose', 'ground'),

      //safezone row 8

      createObstacles(9, 3, 'car', 2, 'left', 'lose', 'ground'),
      createObstacles(9, 7, 'car', 2, 'left', 'lose', 'ground'),
      createObstacles(9, 8, 'car', 2, 'left', 'lose', 'ground'),
      createObstacles(9, 11, 'car', 2, 'left', 'lose', 'ground'),

      createObstacles(10, 11, 'car', 3, 'right', 'lose', 'ground')

      // safezone 11
    ]
  }

  /**
   * moveObstacles
   * This allows us to move an object to a direction and distance that we want to deal with
   * @param o obstacle to make an action
   * @param d the directio nto move
   * @param s number of steps to move
   * @returns a new obstacle with updated x and y coordinates
   */
  const moveObs = (o: Obstacle, d: Direction, s: number) => 
    d == 'left' ? { // if the direction is left,just change the x value of original obstacle.
      ...o,
      x: moveX(o.x, -1*s, false)
    } as Obstacle:
    d == 'right' ? {
      ...o,
      x: moveX(o.x, 1*s, false)
    } as Obstacle:
    // these parts for up and down are not used, but could be used in the future in extensions such as object crossing row
    d == 'up' ? {
      ...o,
      y: moveY(o.y, -1*s, false)
    } as Obstacle:
    d == 'down' ? {
      ...o,
      y: moveY(o.y, 1*s, false)
    } as Obstacle: o //return original otherwise

  /**
   * This allows us to move a frog to a direction and distance we want to deal with, and updates the state
   * @param s The current state of the game
   * @param d direction to move the frog
   * @param n number of grid to move the frog, usually 1 without the speedups
   * @returns new state with updated frog coordinates and, other important parameters such as scores
   */
  const moveFrog = (s: State, d: Direction, n: number) => 
    d == 'left' ? {
      ...s,
      frogCordX: moveX(s.frogCordX, -1*n, true)
    } as State:
    d == 'right' ? { // the design is similar to moveObs
      ...s,
      frogCordX: moveX(s.frogCordX, 1*n, true)
    } as State:
    d == 'up' ? { // when the frog goes up and it is the first time it reaches that height, it must increment score
      ...s,
      frogCordY: moveY(s.frogCordY, -1*n, true),
      currentScore: (Constants.N_Y - s.frogCordY + 1) >= s.highestRow ? s.currentScore + n*10: s.currentScore, // increment score count when it is the highest y it reached
      highestScore: s.highestScore < s.currentScore ? s.currentScore: s.highestScore, // update highest score 
      highestRow: s.highestRow < (Constants.N_Y - s.frogCordY + 1) ? (Constants.N_Y - s.frogCordY + 1): s.highestRow, // if newly reached highest row, update it
    } as State:
    d == 'down' ? {
      ...s,
      frogCordY: moveY(s.frogCordY, 1*n, true)
    } as State: s //do nothing otherwise
  
  /**
   * These are helper functions for moveFrog and moveObs.
   * The objective is to perform basic manipulation of numbers, but within the grid limit provided (12 x 12)
   * @param x x coordinate, or y coordinate
   * @param n number of steps to move
   * @param stopbywall boolean, true if it can't pass through the wall(frog), and false it can keep going(cars and planks)
   * @returns the new coordinates, Cord_X or Cord_Y
   */
  const moveX = (x: Cord_X, n: number, stopbywall: boolean) => { // helper function that takes in n value to move on x axis
    return stopbywall? x + n < 0? 0: x + n >= Constants.N_X? Constants.N_X: x+n: // if boolean is true and hit either wall, stop at wall
    x + n < 0 ? Constants.N_X + (x + n): (x + n) % Constants.N_X as Cord_X// if boolean is false and hit either wall, pass throug hit and come from other side
  }
  const moveY = (y: Cord_Y, n: number, stopbywall: boolean) => { // helper function that takes in n value to move on y axis
    return stopbywall? y + n < 0? 0: y + n >= Constants.N_Y? Constants.N_Y: y+n:
    y + n < 0 ? Constants.N_Y + (y + n): (y + n) % Constants.N_X as Cord_Y // take reminder, %, for cases such as y = 13
  }

  /**
   * This handles all the collissions between the frog and other obstacles.
   * It also checks if it reached the goal.
   * @param s the current game state
   * @returns New state, with frogWon indicator updated as won, lost or ongoing respectively
   */
  const handleCollisions = (s:State) => {
    // returns 'win' if goal is reached, 'lose' when hit with car/water, 'pass' otherwise
    const onFrog = s.obstacles.filter(o => (o.x == s.frogCordX) && (o.y == s.frogCordY)) // list of objects that are on collision with frog
    const riverObs = s.obstacles.filter(o => o.environment == 'river') // list of obstacles that is in the same y axis as river
    // returns the new state, after handling collisions
    const newState = onFrog.filter(o => o.touchable == 'win').length!=0?{ // when it reaches goal
      ...s,
      frogWon: 'won'
    } as State : onFrog.filter(o => o.touchable == 'lose').length!=0?{ // when it hits car or other obstacles that has 'lose'
      ...s,
      frogWon: 'lost'
    } as State: !(onFrog.filter(o => o.touchable == 'pass').length!=0) && (riverObs.filter(i=>i.y==s.frogCordY).length!=0)?{ // lose if it is in river without plank
      ...s,
      frogWon: 'lost'
    } as State: s // if the obstacle was empty, ignore and go on 
    return newState
  }


  /**
   * Let the game to tick constant to allow obstacles to move
   * @param s The current game state
   * @returns The updated game state
   */
  const tick = (s:State) => { // no need to record time in my implementation, hence no use of elapsed:time
    const obsArray = s.obstacles // array of obstacles currently
    const carTick = obsArray.filter(o => o.viewType == 'car').map(o => moveObs(o, o.direction, o.speed)) as Obstacle[] // find all car obstacles, and apply to moveObs()
    const plankTick = obsArray.filter(o => o.viewType == 'plank').map(o => moveObs(o, o.direction, o.speed)) as Obstacle[] // find all plank obsstacles and move them according to the speed and direction
    const othersTick = obsArray.filter(o => o.viewType != ('car' && 'plank')).map(o => moveObs(o, o.direction, o.speed)) as Obstacle[] // this way, it combines all existing obstacles

    return handleCollisions({...s,
      obstacles: [...carTick, ...plankTick, ...othersTick] as Obstacle[] // merge all obstacle after mapping and appying moveObs()
    })
  }

  /**
   * This is simply reducer function, which is called each time after observablesdepending on 
   * @param s current game state
   * @param e an action to perform, Move for moving frog or Tick for moving objects. Any type is needed as 
   * rxjs merge has problems on certain conditions and I had to fix them
   * @returns the updated state of the game
   */
  const reduceFrog = (s: State, e: Move | Tick | any)=> // the action is either tick or move
  // any is added here to adapt to static merge
    e instanceof Move ? moveFrog(s, e.direction, e.distance) // if the action is move, move the frog
    :tick(s) // simply tick otherwise, if no movement is given by user
  
  /**
   * This subscribes to the clock (timer to tick), and actions by the user
   * The code is similar to the asteroids examples
   */
  const subscription =
    merge(gameClock,
      startLeftMove,
      startRightMove,startUpMove,
      startDownMove, stopLeftMove,
      stopRightMove, stopUpMove,
      stopDownMove)
    .pipe(
      scan(reduceFrog, initialState)) // for each actions, perform reduceFrog and add it to accumulator initialState
    .subscribe(updateView) // change the view for player

  const cordx_to_px = (x: Cord_X) => { // convert cord, 1-11, to pixels in the svg to show to the player
    return x * 50 as number
  }
  const cordy_to_px = (y: Cord_Y) => { // convert cord, 1-11, to pixels in the svg
    return y * 50 as number
  }

  /**
   * This is the large function to update the view for the player.
   * It is impure, however, all inconsistent handles are given in here and it allows us to manage the whole UI + iterations
   * @param s the current game state
   * @returns it only returns none when it reaches win or lose.
   */
  function updateView(s: State){ 
    const svg = document.getElementById("svgCanvas")!

    // Update the score board
    const oldScore = document.getElementById("score");
    oldScore ? svg.removeChild(oldScore): null

    const score = document.createElementNS(svg.namespaceURI, "text")!;
    score.setAttribute("x",String(Constants.SCORE_X));
    score.setAttribute("y",String(Constants.SCORE_Y));
    score.setAttribute("id", "score");
    score.textContent = "Score: " + s.currentScore + ", High Score: " + s.highestScore;
    svg.appendChild(score);

    // remove all obstacles from previous iterations
    const obsArray = s.obstacles
    obsArray.forEach(o=>{
      const v = document.getElementById(String(o.viewType));
      v ? svg.removeChild(v): null
    })


    const updateObstacleView = (o: Obstacle) => {
      function createObstacleView(){ // it returns this useful function to show to the user for any obstacle given
        const grid = document.createElementNS(svg.namespaceURI, "rect")!;
        grid.setAttribute("x", String(cordx_to_px(o.x)));
        grid.setAttribute("y", String(cordy_to_px(o.y)));
        grid.setAttribute("width", String(Constants.GRID_SIZE));
        grid.setAttribute("height", String(Constants.GRID_SIZE)); // creates rectangle object for each obstacle
        grid.setAttribute("id", String(o.viewType)); // set id as the obstacle name, to change properties later on
        grid.classList.add(String(o.viewType));
        svg.appendChild(grid); // add the grid and show
        return grid; 
      }
      const v = document.getElementById(o.id) || createObstacleView();
    }
    // this line below adds all obstacles after the latest iteration
    obsArray.forEach(updateObstacleView);

    // draw the frog lastly
    const oldFrog = document.getElementById("frog");
    oldFrog ? svg.removeChild(oldFrog): null // remove previous frog

    const frog = document.createElementNS(svg.namespaceURI, "rect")!;
    frog.setAttribute("x", String(cordx_to_px(s.frogCordX)));
    frog.setAttribute("y", String(cordy_to_px(s.frogCordY)));
    frog.setAttribute("width", String(Constants.GRID_SIZE));
    frog.setAttribute("height", String(Constants.GRID_SIZE));
    frog.setAttribute("id", "frog"); // set id as the frog, and show the frog
    frog.classList.add("frog");
    svg.appendChild(frog);
    
    if(s.frogWon == 'won') { // if the frog reached goal, unsubscribe, show message and end the game
      subscription.unsubscribe();
      const v = document.createElementNS(svg.namespaceURI, "text")!;
      v.setAttribute("x",String(Constants.MESSAGE_X));
      v.setAttribute("y",String(Constants.MESSAGE_Y));
      v.setAttribute("id", "gamemessage");
      v.textContent = "Game Won!";
      svg.appendChild(v);
      return;
    }

    if(s.frogWon == 'lost') { // if the frog lost, unsubscribe, show message and end the game
      subscription.unsubscribe();
      const v = document.createElementNS(svg.namespaceURI, "text")!;
      v.setAttribute("x",String(Constants.MESSAGE_X));
      v.setAttribute("y",String(Constants.MESSAGE_Y));
      v.setAttribute("id", "gamemessage");
      v.textContent = "Game Over!";
      svg.appendChild(v);
      return;
    }
  }
}

if (typeof window !== "undefined") {
  window.onload = () => {
    main();
  };
}
