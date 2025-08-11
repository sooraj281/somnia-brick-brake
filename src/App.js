import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = '0x108653d7B24dA8214249c77eAB9D93346227142a';
const CONTRACT_ABI = [
  "function startGame() external payable",
  "function winGame() external",
  "function loseGame() external",
  "function getPlayerStats(address player) external view returns (uint256 wins, uint256 gamesPlayed, uint256 totalEarnings, bool hasActiveGame)",
  "function gameEntryFee() external view returns (uint256)",
  "function winReward() external view returns (uint256)",
  "event GameStarted(address indexed player, uint256 entryFee)",
  "event GameWon(address indexed player, uint256 reward)",
  "event GameLost(address indexed player)"
];

// Somnia Testnet configuration
const SOMNIA_TESTNET = {
  chainId: '0xC488', // 50312 in hex
  chainName: 'Somnia Testnet',
  nativeCurrency: {
    name: 'STT',
    symbol: 'STT',

    decimals: 18,
  },
  rpcUrls: ['https://testnet.somnia.network'], // Adjust RPC URL if needed
  blockExplorerUrls: ['https://testnet-explorer.somnia.network'], // Adjust explorer URL if needed
};

function App() {
  // Wallet state
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Game state
  const [gameActive, setGameActive] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [gameLost, setGameLost] = useState(false);
  const [playerStats, setPlayerStats] = useState({
    wins: 0,
    gamesPlayed: 0,
    totalEarnings: 0,
    hasActiveGame: false
  });

  // Contract info
  const [entryFee, setEntryFee] = useState('0');
  const [winReward, setWinReward] = useState('0');

  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  const gameStateRef = useRef({
    paddle: { x: 0, y: 0, width: 100, height: 10, speed: 8 },
    ball: { x: 0, y: 0, dx: 4, dy: -4, radius: 8, trail: [] },
    bricks: [],
    keys: {},
    score: 0,
    lives: 3,
    isActive: false,
    particles: [],
    powerUps: [],
    combo: 0,
    maxCombo: 0,
    ballSpeed: 4,
    paddleGlow: 0,
    screenShake: 0,
    lastBrickHit: 0
  });

  // Initialize game canvas and objects
  const initGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gameState = gameStateRef.current;

    // Set canvas size
    canvas.width = 800;
    canvas.height = 600;

    // Initialize paddle
    gameState.paddle.x = canvas.width / 2 - gameState.paddle.width / 2;
    gameState.paddle.y = canvas.height - 30;

    // Initialize ball
    gameState.ball.x = canvas.width / 2;
    gameState.ball.y = canvas.height - 50;

    // Initialize bricks
    gameState.bricks = [];
    const brickRows = 5;
    const brickCols = 10;
    const brickWidth = 70;
    const brickHeight = 20;
    const brickPadding = 5;
    const brickOffsetTop = 60;
    const brickOffsetLeft = 35;

    for (let r = 0; r < brickRows; r++) {
      for (let c = 0; c < brickCols; c++) {
        gameState.bricks.push({
          x: c * (brickWidth + brickPadding) + brickOffsetLeft,
          y: r * (brickHeight + brickPadding) + brickOffsetTop,
          width: brickWidth,
          height: brickHeight,
          visible: true,
          color: `hsl(${r * 60}, 70%, 50%)`
        });
      }
    }

    gameState.score = 0;
    gameState.lives = 3;
  }, []);

  // Create particle effect
  const createParticles = useCallback((x, y, color, count = 8) => {
    const gameState = gameStateRef.current;
    for (let i = 0; i < count; i++) {
      gameState.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        life: 1.0,
        decay: 0.02,
        color: color,
        size: Math.random() * 4 + 2
      });
    }
  }, []);

  // Create power-up indicator
  const createPowerUpIndicator = useCallback((x, y, text, color) => {
    const gameState = gameStateRef.current;
    gameState.powerUps.push({
      x: x,
      y: y,
      text: text,
      color: color,
      life: 1.0,
      decay: 0.015
    });
  }, []);

  // Game rendering with enhanced visuals
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gameState = gameStateRef.current;

    // Apply screen shake
    if (gameState.screenShake > 0) {
      ctx.save();
      ctx.translate(
        Math.random() * gameState.screenShake - gameState.screenShake / 2,
        Math.random() * gameState.screenShake - gameState.screenShake / 2
      );
      gameState.screenShake *= 0.9;
    }

    // Clear canvas with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0a0a0a');
    gradient.addColorStop(0.5, '#1a0a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw starfield background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let i = 0; i < 50; i++) {
      const x = (i * 137.5) % canvas.width;
      const y = (i * 73.3) % canvas.height;
      const size = Math.sin(Date.now() * 0.001 + i) * 0.5 + 1;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw ball trail
    if (gameState.ball.trail.length > 0) {
      ctx.globalCompositeOperation = 'lighter';
      gameState.ball.trail.forEach((point, index) => {
        const alpha = index / gameState.ball.trail.length;
        ctx.fillStyle = `rgba(78, 205, 196, ${alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, gameState.ball.radius * alpha, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
    }

    // Draw enhanced paddle with glow
    const paddleGlow = Math.sin(Date.now() * 0.005) * 0.3 + 0.7;
    ctx.shadowColor = '#4ecdc4';
    ctx.shadowBlur = 10 + gameState.paddleGlow;
    ctx.fillStyle = `rgba(78, 205, 196, ${paddleGlow})`;
    ctx.fillRect(gameState.paddle.x, gameState.paddle.y, gameState.paddle.width, gameState.paddle.height);

    // Paddle highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(gameState.paddle.x, gameState.paddle.y, gameState.paddle.width, 2);

    // Draw enhanced ball with glow and pulsing effect
    const ballPulse = Math.sin(Date.now() * 0.01) * 2 + gameState.ball.radius;
    ctx.shadowColor = '#ff6b6b';
    ctx.shadowBlur = 15;

    // Outer glow
    ctx.fillStyle = 'rgba(255, 107, 107, 0.3)';
    ctx.beginPath();
    ctx.arc(gameState.ball.x, gameState.ball.y, ballPulse + 5, 0, Math.PI * 2);
    ctx.fill();

    // Main ball
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(gameState.ball.x, gameState.ball.y, gameState.ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // Ball highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(gameState.ball.x - 2, gameState.ball.y - 2, gameState.ball.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Draw enhanced bricks with glow and animation
    gameState.bricks.forEach((brick, index) => {
      if (brick.visible) {
        const time = Date.now() * 0.001;
        const wave = Math.sin(time + index * 0.1) * 0.1 + 0.9;

        // Brick glow
        ctx.shadowColor = brick.color;
        ctx.shadowBlur = 5;
        ctx.fillStyle = brick.color;
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height);

        // Brick highlight with wave effect
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(255, 255, 255, ${wave * 0.3})`;
        ctx.fillRect(brick.x, brick.y, brick.width, 3);

        // Brick border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
      }
    });

    // Draw particles
    ctx.globalCompositeOperation = 'lighter';
    gameState.particles.forEach(particle => {
      if (particle.life > 0) {
        ctx.fillStyle = `rgba(${particle.color}, ${particle.life})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalCompositeOperation = 'source-over';

    // Draw power-up indicators
    gameState.powerUps.forEach(powerUp => {
      if (powerUp.life > 0) {
        ctx.font = 'bold 16px Orbitron, monospace';
        ctx.fillStyle = `rgba(${powerUp.color}, ${powerUp.life})`;
        ctx.textAlign = 'center';
        ctx.fillText(powerUp.text, powerUp.x, powerUp.y - (1 - powerUp.life) * 30);
      }
    });

    // Draw enhanced UI
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';

    // Score with glow
    ctx.font = 'bold 24px Orbitron, monospace';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`SCORE: ${gameState.score}`, 20, 40);

    // Lives with hearts
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff6b6b';
    const heartsText = '❤️'.repeat(gameState.lives);
    ctx.fillText(`LIVES: ${heartsText}`, canvas.width - 20, 40);

    // Combo indicator
    if (gameState.combo > 1) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px Orbitron, monospace';
      ctx.fillStyle = '#4ecdc4';
      ctx.shadowColor = '#4ecdc4';
      ctx.shadowBlur = 15;
      ctx.fillText(`COMBO x${gameState.combo}`, canvas.width / 2, 80);
    }

    // Max combo display
    if (gameState.maxCombo > 1) {
      ctx.textAlign = 'center';
      ctx.font = '16px Orbitron, monospace';
      ctx.fillStyle = '#96ceb4';
      ctx.shadowBlur = 5;
      ctx.fillText(`Best Combo: x${gameState.maxCombo}`, canvas.width / 2, canvas.height - 20);
    }

    if (gameState.screenShake > 0) {
      ctx.restore();
    }
  }, []);

  // Collision detection
  const checkCollisions = useCallback(() => {
    const gameState = gameStateRef.current;
    const ball = gameState.ball;
    const paddle = gameState.paddle;

    // Ball-wall collisions
    if (ball.x + ball.radius > canvasRef.current.width || ball.x - ball.radius < 0) {
      ball.dx = -ball.dx;
    }
    if (ball.y - ball.radius < 0) {
      ball.dy = -ball.dy;
    }

    // Ball-paddle collision
    if (ball.y + ball.radius > paddle.y &&
      ball.x > paddle.x &&
      ball.x < paddle.x + paddle.width) {
      ball.dy = -ball.dy;
      // Add some angle based on where ball hits paddle
      const hitPos = (ball.x - paddle.x) / paddle.width;
      ball.dx = 4 * (hitPos - 0.5);
    }

    // Ball-brick collisions - ball goes through bricks
    gameState.bricks.forEach(brick => {
      if (brick.visible &&
        ball.x > brick.x &&
        ball.x < brick.x + brick.width &&
        ball.y > brick.y &&
        ball.y < brick.y + brick.height) {
        // Just destroy the brick, don't change ball direction
        brick.visible = false;
        gameState.score += 10;
      }
    });

    // Check win condition
    const visibleBricks = gameState.bricks.filter(brick => brick.visible);
    if (visibleBricks.length === 0) {
      return 'win';
    }

    // Check lose condition
    if (ball.y + ball.radius > canvasRef.current.height) {
      gameState.lives--;
      if (gameState.lives <= 0) {
        return 'lose';
      } else {
        // Reset ball position
        ball.x = canvasRef.current.width / 2;
        ball.y = canvasRef.current.height - 50;
        ball.dx = 4;
        ball.dy = -4;
      }
    }

    return 'continue';
  }, []);

  // Load player statistics
  const loadPlayerStats = useCallback(async (playerAddress, contractInstance) => {
    try {
      const stats = await contractInstance.getPlayerStats(playerAddress);
      setPlayerStats({
        wins: Number(stats[0]),
        gamesPlayed: Number(stats[1]),
        totalEarnings: ethers.formatEther(stats[2]),
        hasActiveGame: stats[3]
      });
    } catch (err) {
      console.error('Error loading player stats:', err);
    }
  }, []);

  // Handle game win
  const handleGameWin = useCallback(async () => {
    if (contract) {
      try {
        const tx = await contract.winGame();
        await tx.wait();
        await loadPlayerStats(account, contract);
      } catch (err) {
        setError(err.message);
      }
    }
  }, [contract, account, loadPlayerStats]);

  // Handle game loss
  const handleGameLose = useCallback(async () => {
    if (contract) {
      try {
        const tx = await contract.loseGame();
        await tx.wait();
        await loadPlayerStats(account, contract);
      } catch (err) {
        setError(err.message);
      }
    }
  }, [contract, account, loadPlayerStats]);

  // Enhanced game loop with gamification features
  const gameLoop = useCallback(() => {
    const gameState = gameStateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if game is still active
    if (!gameState.isActive) return;

    const currentTime = Date.now();

    // Update paddle with enhanced movement
    if (gameState.keys['ArrowLeft'] && gameState.paddle.x > 0) {
      gameState.paddle.x -= gameState.paddle.speed;
      gameState.paddleGlow = Math.min(gameState.paddleGlow + 2, 20);
    }
    if (gameState.keys['ArrowRight'] && gameState.paddle.x < canvas.width - gameState.paddle.width) {
      gameState.paddle.x += gameState.paddle.speed;
      gameState.paddleGlow = Math.min(gameState.paddleGlow + 2, 20);
    }

    // Fade paddle glow
    gameState.paddleGlow *= 0.95;

    // Update ball position
    gameState.ball.x += gameState.ball.dx;
    gameState.ball.y += gameState.ball.dy;

    // Update ball trail
    gameState.ball.trail.push({ x: gameState.ball.x, y: gameState.ball.y });
    if (gameState.ball.trail.length > 10) {
      gameState.ball.trail.shift();
    }

    // Update particles
    gameState.particles = gameState.particles.filter(particle => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= 0.98;
      particle.vy *= 0.98;
      particle.life -= particle.decay;
      return particle.life > 0;
    });

    // Update power-up indicators
    gameState.powerUps = gameState.powerUps.filter(powerUp => {
      powerUp.life -= powerUp.decay;
      return powerUp.life > 0;
    });

    // Check collisions
    const ball = gameState.ball;
    const paddle = gameState.paddle;

    // Ball-wall collisions with particles
    if (ball.x + ball.radius > canvas.width || ball.x - ball.radius < 0) {
      ball.dx = -ball.dx;
      createParticles(ball.x, ball.y, '78, 205, 196', 5);
      gameState.screenShake = 3;
    }
    if (ball.y - ball.radius < 0) {
      ball.dy = -ball.dy;
      createParticles(ball.x, ball.y, '78, 205, 196', 5);
      gameState.screenShake = 3;
    }

    // Ball-paddle collision with enhanced effects
    if (ball.y + ball.radius > paddle.y &&
      ball.x > paddle.x &&
      ball.x < paddle.x + paddle.width) {
      ball.dy = -ball.dy;

      // Enhanced paddle physics
      const hitPos = (ball.x - paddle.x) / paddle.width;
      const angle = (hitPos - 0.5) * Math.PI / 3; // Max 60 degree angle
      const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
      ball.dx = Math.sin(angle) * speed;
      ball.dy = -Math.cos(angle) * speed;

      // Visual effects
      createParticles(ball.x, paddle.y, '78, 205, 196', 8);
      gameState.paddleGlow = 30;
      gameState.screenShake = 2;

      // Reset combo on paddle hit
      gameState.combo = 0;
    }

    // Ball-brick collisions with enhanced effects
    let bricksHitThisFrame = 0;
    gameState.bricks.forEach((brick, index) => {
      if (brick.visible &&
        ball.x > brick.x &&
        ball.x < brick.x + brick.width &&
        ball.y > brick.y &&
        ball.y < brick.y + brick.height) {

        // Destroy brick
        brick.visible = false;
        bricksHitThisFrame++;

        // Combo system
        if (currentTime - gameState.lastBrickHit < 1000) { // Within 1 second
          gameState.combo++;
        } else {
          gameState.combo = 1;
        }
        gameState.lastBrickHit = currentTime;

        // Update max combo
        if (gameState.combo > gameState.maxCombo) {
          gameState.maxCombo = gameState.combo;
        }

        // Score calculation with combo multiplier
        const baseScore = 10;
        const comboBonus = Math.floor(gameState.combo / 3) * 5; // Bonus every 3 hits
        const totalScore = baseScore + comboBonus;
        gameState.score += totalScore;

        // Visual effects
        const brickCenterX = brick.x + brick.width / 2;
        const brickCenterY = brick.y + brick.height / 2;

        // Extract RGB from HSL color
        const hue = (Math.floor(index / 10) * 60) % 360;
        const rgb = `${Math.floor(255 * (1 - Math.abs((hue / 60) % 2 - 1)))}, ${Math.floor(255 * 0.7)}, ${Math.floor(255 * 0.5)}`;

        createParticles(brickCenterX, brickCenterY, rgb, 12);

        // Power-up indicators
        if (comboBonus > 0) {
          createPowerUpIndicator(brickCenterX, brickCenterY, `+${totalScore} COMBO!`, '78, 205, 196');
        } else {
          createPowerUpIndicator(brickCenterX, brickCenterY, `+${totalScore}`, '255, 215, 0');
        }

        // Screen shake based on combo
        gameState.screenShake = Math.min(2 + gameState.combo * 0.5, 8);

        // Special effects for high combos
        if (gameState.combo >= 5) {
          createParticles(brickCenterX, brickCenterY, '255, 215, 0', 20);
          createPowerUpIndicator(brickCenterX, brickCenterY - 30, `${gameState.combo}x COMBO!`, '255, 107, 107');
        }
      }
    });

    // Render the enhanced game
    render();

    // Check win condition
    const visibleBricks = gameState.bricks.filter(brick => brick.visible);
    if (visibleBricks.length === 0) {
      gameState.isActive = false;
      setGameWon(true);
      setGameActive(false);

      // Victory effects
      createParticles(canvas.width / 2, canvas.height / 2, '78, 205, 196', 50);
      createPowerUpIndicator(canvas.width / 2, canvas.height / 2, 'VICTORY!', '255, 215, 0');

      // Handle win on blockchain
      if (contract && account) {
        contract.winGame().then(tx => tx.wait()).then(() => {
          loadPlayerStats(account, contract);
        }).catch(err => {
          console.error('Error calling winGame:', err);
          setError(err.message);
        });
      }
      return;
    }

    // Check lose condition
    if (ball.y + ball.radius > canvas.height) {
      gameState.lives--;
      gameState.combo = 0; // Reset combo on life lost

      // Life lost effects
      createParticles(ball.x, canvas.height, '255, 107, 107', 15);
      gameState.screenShake = 10;

      if (gameState.lives <= 0) {
        gameState.isActive = false;
        setGameLost(true);
        setGameActive(false);

        // Game over effects
        createParticles(canvas.width / 2, canvas.height / 2, '255, 107, 107', 30);
        createPowerUpIndicator(canvas.width / 2, canvas.height / 2, 'GAME OVER', '255, 107, 107');

        // Handle loss on blockchain
        if (contract && account) {
          contract.loseGame().then(tx => tx.wait()).then(() => {
            loadPlayerStats(account, contract);
          }).catch(err => {
            console.error('Error calling loseGame:', err);
            setError(err.message);
          });
        }
        return;
      } else {
        // Reset ball position with effects
        ball.x = canvas.width / 2;
        ball.y = canvas.height - 50;
        ball.dx = 4;
        ball.dy = -4;
        ball.trail = [];

        createPowerUpIndicator(canvas.width / 2, canvas.height / 2, `${gameState.lives} LIVES LEFT`, '255, 215, 0');
      }
    }

    // Continue the game loop
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [contract, account, loadPlayerStats, render, createParticles, createPowerUpIndicator]);

  // Initialize canvas when component mounts
  useEffect(() => {
    initGame();
    render();
  }, [initGame, render]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      gameStateRef.current.keys[e.key] = true;
    };

    const handleKeyUp = (e) => {
      gameStateRef.current.keys[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Connect wallet
  const connectWallet = async () => {
    try {
      setLoading(true);
      setError('');

      if (!window.ethereum) {
        throw new Error('MetaMask not found. Please install MetaMask.');
      }

      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      // Switch to Somnia testnet
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: SOMNIA_TESTNET.chainId }],
        });
      } catch (switchError) {
        // Chain not added, try to add it
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [SOMNIA_TESTNET],
          });
        } else {
          throw switchError;
        }
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      setAccount(accounts[0]);
      setProvider(provider);
      setContract(contract);

      // Load contract info
      const fee = await contract.gameEntryFee();
      const reward = await contract.winReward();
      setEntryFee(ethers.formatEther(fee));
      setWinReward(ethers.formatEther(reward));

      // Load player stats
      await loadPlayerStats(accounts[0], contract);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Start game on blockchain
  const startBlockchainGame = async () => {
    try {
      setLoading(true);
      setError('');

      console.log('Starting blockchain game...');
      console.log('Account:', account);
      console.log('Player stats:', playerStats);

      // Check if player already has an active game
      if (playerStats.hasActiveGame) {
        throw new Error('You already have an active game. Please finish or lose your current game first.');
      }

      // Get entry fee and validate
      const fee = await contract.gameEntryFee();
      console.log('Entry fee:', ethers.formatEther(fee), 'STT');

      // Check wallet balance
      const balance = await provider.getBalance(account);
      console.log('Wallet balance:', ethers.formatEther(balance), 'STT');

      if (balance < fee) {
        throw new Error(`Insufficient balance. You need ${ethers.formatEther(fee)} STT but only have ${ethers.formatEther(balance)} STT`);
      }

      // Estimate gas first to catch errors early
      try {
        const gasEstimate = await contract.startGame.estimateGas({ value: fee });
        console.log('Gas estimate:', gasEstimate.toString());
      } catch (gasError) {
        console.error('Gas estimation failed:', gasError);

        // Provide more specific error messages
        if (gasError.message.includes('require(false)') || gasError.data === '0x') {
          if (playerStats.hasActiveGame) {
            throw new Error('You already have an active game. Please finish your current game first.');
          } else {
            throw new Error('Contract rejected the transaction. This might be due to insufficient contract balance or other contract conditions.');
          }
        }
        throw new Error(`Transaction would fail: ${gasError.message}`);
      }

      console.log('Sending transaction...');
      const tx = await contract.startGame({
        value: fee,
        gasLimit: 300000 // Set a reasonable gas limit
      });

      console.log('Transaction sent:', tx.hash);
      console.log('Waiting for confirmation...');

      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);

      // Check if transaction was successful
      if (receipt.status === 1) {
        console.log('✅ Transaction successful! Starting game...');

        // Start the actual game
        setGameActive(true);
        setGameWon(false);
        setGameLost(false);
        initGame();
        gameStateRef.current.isActive = true;

        console.log('Game state set to active, starting game loop...');
        gameLoopRef.current = requestAnimationFrame(gameLoop);

        // Reload stats
        await loadPlayerStats(account, contract);
        console.log('✅ Game started successfully!');
      } else {
        throw new Error('Transaction failed');
      }

    } catch (err) {
      console.error('Error starting blockchain game:', err);

      // Provide user-friendly error messages
      let errorMessage = err.message;

      if (err.message.includes('require(false)')) {
        errorMessage = 'Contract rejected the transaction. You might already have an active game or there might be insufficient contract balance.';
      } else if (err.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient STT balance to pay the entry fee and gas costs.';
      } else if (err.message.includes('user rejected')) {
        errorMessage = 'Transaction was rejected by user.';
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Stop game
  const stopGame = () => {
    setGameActive(false);
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
  };

  return (
    <div className="game-container">
      <div className="game-header">
        <h1>🧱 Somnia Brick Breaker</h1>
        <p>Play-to-Earn Brick Breaker on Somnia Testnet</p>
      </div>

      <div className="wallet-section">
        {!account ? (
          <div>
            <p>Connect your wallet to start playing!</p>
            <button
              className="connect-button"
              onClick={connectWallet}
              disabled={loading}
            >
              {loading ? 'Connecting...' : 'Connect Wallet'}
            </button>
          </div>
        ) : (
          <div>
            <p>Connected: {account.slice(0, 6)}...{account.slice(-4)}</p>
            <p>Entry Fee: {entryFee} STT | Win Reward: {winReward} STT</p>
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {account && (
        <>
          <div className="game-stats">
            <div className="stat-card">
              <div className="stat-value">{playerStats.wins}</div>
              <div>Wins</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{playerStats.gamesPlayed}</div>
              <div>Games Played</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{playerStats.totalEarnings}</div>
              <div>Total Earnings (STT)</div>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            className="game-canvas"
            width={800}
            height={600}
          />

          <div className="game-controls">
            {!gameActive && !gameWon && !gameLost && (
              <>
                <button
                  className="game-button"
                  onClick={startBlockchainGame}
                  disabled={loading || playerStats.hasActiveGame}
                >
                  {loading ? 'Starting...' : 'Start New Game (Pay Entry Fee)'}
                </button>
                <button
                  className="game-button"
                  onClick={() => {
                    setGameActive(true);
                    setGameWon(false);
                    setGameLost(false);
                    initGame();
                    gameStateRef.current.isActive = true;
                    gameLoopRef.current = requestAnimationFrame(gameLoop);
                  }}
                  style={{ backgroundColor: '#28a745' }}
                >
                  Test Game (Free Play)
                </button>
              </>
            )}

            {gameActive && (
              <div>
                <p>Use ← → arrow keys to move the paddle</p>
                <button className="game-button" onClick={stopGame}>
                  Stop Game
                </button>
              </div>
            )}

            {gameWon && (
              <div>
                <h2 style={{ color: '#4CAF50' }}>🎉 You Won!</h2>
                <p>Congratulations! You earned {winReward} STT</p>
                <button
                  className="game-button"
                  onClick={() => {
                    setGameWon(false);
                    setGameActive(false);
                    setGameLost(false);
                  }}
                  style={{ backgroundColor: '#4CAF50', marginTop: '10px' }}
                >
                  Try Again
                </button>
              </div>
            )}

            {gameLost && (
              <div>
                <h2 style={{ color: '#f44336' }}>💥 Game Over</h2>
                <p>Better luck next time!</p>
                <button
                  className="game-button"
                  onClick={() => {
                    setGameLost(false);
                    setGameActive(false);
                    setGameWon(false);
                  }}
                  style={{ backgroundColor: '#f44336', marginTop: '10px' }}
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;