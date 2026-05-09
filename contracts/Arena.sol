// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title Arena
 * @dev 基于区块链的去中心化竞技场平台
 */
contract Arena is ReentrancyGuard, Ownable, Pausable {
    
    // PK状态枚举
    enum PKStatus { 
        Active,     // 进行中
        Settled,    // 已结算
        Cancelled   // 已取消
    }
    
    // PK结构体
    struct PK {
        uint256 id;                    // PK ID
        address creator;              // 创建者地址
        string title;                 // PK标题
        string description;           // PK描述
        string[] options;             // 投票选项
        uint256 startTime;           // 开始时间
        uint256 endTime;             // 结束时间
        uint256 minBetAmount;        // 最低下注金额
        uint256 totalPool;           // 总奖池
        uint8 winningOption;         // 获胜选项
        PKStatus status;             // PK状态
        mapping(uint8 => uint256) optionPools; // 各选项奖池
        mapping(address => UserBet) userBets;  // 用户下注记录
    }
    
    // 用户下注结构体
    struct UserBet {
        uint256 amount;     // 下注金额
        uint8 optionIndex;  // 选项索引
        bool claimed;       // 是否已领取奖励
    }
    
    // 平台费用结构
    struct PlatformFee {
        uint256 creationFee;    // 创建费用
        uint256 platformFee;     // 平台手续费百分比 (100 = 1%)
    }
    
    // 状态变量
    uint256 public pkCounter;           // PK计数器
    uint256 public constant PLATFORM_FEE_DENOMINATOR = 10000; // 手续费分母
    PlatformFee public platformFee;     // 平台费用配置
    
    // 映射
    mapping(uint256 => PK) public pks; // PK映射
    mapping(address => uint256[]) public userCreatedPKs; // 用户创建的PK列表
    mapping(address => uint256[]) public userParticipatedPKs; // 用户参与的PK列表
    
    // 事件
    event PKCreated(uint256 indexed pkId, address indexed creator, string title, uint256 endTime);
    event BetPlaced(uint256 indexed pkId, address indexed user, uint8 optionIndex, uint256 amount);
    event PKSettled(uint256 indexed pkId, uint8 winningOption, uint256 totalPool);
    event RewardClaimed(uint256 indexed pkId, address indexed user, uint256 amount);
    event PlatformFeeUpdated(uint256 creationFee, uint256 platformFee);
    
    // 构造函数
    constructor(uint256 _creationFee, uint256 _platformFee) Ownable(msg.sender) {
        require(_platformFee <= 1000, "Platform fee too high"); // 最高10%
        platformFee = PlatformFee(_creationFee, _platformFee);
    }
    
    // 创建PK
    function createPK(
        string memory _title,
        string memory _description,
        string[] memory _options,
        uint256 _duration,
        uint256 _minBetAmount
    ) external payable whenNotPaused nonReentrant returns (uint256) {
        // require(msg.value >= platformFee.creationFee, "Insufficient creation fee"); // 暂时关闭创建手续费，方便Demo演示
        require(bytes(_title).length > 0, "Title cannot be empty");
        require(_options.length >= 2, "At least 2 options required");
        require(_duration > 0 && _duration <= 30 days, "Invalid duration");
        require(_minBetAmount > 0, "Min bet amount must be positive");
        
        uint256 pkId = ++pkCounter;
        PK storage newPK = pks[pkId];
        
        newPK.id = pkId;
        newPK.creator = msg.sender;
        newPK.title = _title;
        newPK.description = _description;
        newPK.options = _options;
        newPK.startTime = block.timestamp;
        newPK.endTime = block.timestamp + _duration;
        newPK.minBetAmount = _minBetAmount;
        newPK.status = PKStatus.Active;
        
        userCreatedPKs[msg.sender].push(pkId);
        
        emit PKCreated(pkId, msg.sender, _title, newPK.endTime);
        
        return pkId;
    }
    
    // 参与下注
    function placeBet(uint256 _pkId, uint8 _optionIndex) 
        external 
        payable 
        whenNotPaused 
        nonReentrant 
    {
        PK storage pk = pks[_pkId];
        require(pk.id != 0, "PK does not exist");
        require(pk.status == PKStatus.Active, "PK not active");
        require(block.timestamp < pk.endTime, "PK has ended");
        require(msg.value >= pk.minBetAmount, "Bet amount too low");
        require(_optionIndex < pk.options.length, "Invalid option");
        require(pk.userBets[msg.sender].amount == 0, "Already bet");
        
        // 记录用户下注
        pk.userBets[msg.sender] = UserBet(msg.value, _optionIndex, false);
        pk.optionPools[_optionIndex] += msg.value;
        pk.totalPool += msg.value;
        
        userParticipatedPKs[msg.sender].push(_pkId);
        
        emit BetPlaced(_pkId, msg.sender, _optionIndex, msg.value);
    }
    
    // 结算PK
    function settlePK(uint256 _pkId, uint8 _winningOption) 
        external 
        whenNotPaused 
        nonReentrant 
    {
        PK storage pk = pks[_pkId];
        require(pk.id != 0, "PK does not exist");
        require(pk.status == PKStatus.Active, "PK not active");
        require(block.timestamp >= pk.endTime, "PK not ended");
        require(_winningOption < pk.options.length, "Invalid winning option");
        
        // 只有创建者或平台可以结算
        require(msg.sender == pk.creator || msg.sender == owner(), "Not authorized");
        
        pk.winningOption = _winningOption;
        pk.status = PKStatus.Settled;
        
        emit PKSettled(_pkId, _winningOption, pk.totalPool);
    }
    
    // 领取奖励
    function claimReward(uint256 _pkId) external nonReentrant {
        PK storage pk = pks[_pkId];
        require(pk.id != 0, "PK does not exist");
        require(pk.status == PKStatus.Settled, "PK not settled");
        
        UserBet storage userBet = pk.userBets[msg.sender];
        require(userBet.amount > 0, "No bet found");
        require(!userBet.claimed, "Reward already claimed");
        require(userBet.optionIndex == pk.winningOption, "Not a winner");
        
        // 计算奖励
        uint256 winningPool = pk.optionPools[pk.winningOption];
        uint256 userShare = (userBet.amount * pk.totalPool * (PLATFORM_FEE_DENOMINATOR - platformFee.platformFee)) / 
                           (winningPool * PLATFORM_FEE_DENOMINATOR);
        
        require(userShare > 0, "No reward to claim");
        
        userBet.claimed = true;
        
        // 转移奖励
        (bool success, ) = msg.sender.call{value: userShare}("");
        require(success, "Transfer failed");
        
        emit RewardClaimed(_pkId, msg.sender, userShare);
    }
    
    // 更新平台费用
    function updatePlatformFee(uint256 _creationFee, uint256 _platformFee) external onlyOwner {
        require(_platformFee <= 1000, "Platform fee too high");
        platformFee = PlatformFee(_creationFee, _platformFee);
        emit PlatformFeeUpdated(_creationFee, _platformFee);
    }
    
    // 紧急暂停
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // 获取PK详情
    function getPK(uint256 _pkId) external view returns (
        uint256 id,
        address creator,
        string memory title,
        string memory description,
        string[] memory options,
        uint256 startTime,
        uint256 endTime,
        uint256 minBetAmount,
        uint256 totalPool,
        uint8 winningOption,
        PKStatus status
    ) {
        PK storage pk = pks[_pkId];
        return (
            pk.id,
            pk.creator,
            pk.title,
            pk.description,
            pk.options,
            pk.startTime,
            pk.endTime,
            pk.minBetAmount,
            pk.totalPool,
            pk.winningOption,
            pk.status
        );
    }
    
    // 获取选项奖池
    function getOptionPool(uint256 _pkId, uint8 _optionIndex) external view returns (uint256) {
        return pks[_pkId].optionPools[_optionIndex];
    }
    
    // 获取用户下注信息
    function getUserBet(uint256 _pkId, address _user) external view returns (uint256 amount, uint8 optionIndex, bool claimed) {
        UserBet memory userBet = pks[_pkId].userBets[_user];
        return (userBet.amount, userBet.optionIndex, userBet.claimed);
    }
    
    // 获取用户创建的PK列表
    function getUserCreatedPKs(address _user) external view returns (uint256[] memory) {
        return userCreatedPKs[_user];
    }
    
    // 获取用户参与的PK列表
    function getUserParticipatedPKs(address _user) external view returns (uint256[] memory) {
        return userParticipatedPKs[_user];
    }
    
    // 获取活跃PK数量
    function getActivePKCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 1; i <= pkCounter; i++) {
            if (pks[i].status == PKStatus.Active) {
                count++;
            }
        }
        return count;
    }
    
    // 获取所有PK列表
    function getAllPKs() external view returns (uint256[] memory) {
        uint256[] memory allPKs = new uint256[](pkCounter);
        for (uint256 i = 0; i < pkCounter; i++) {
            allPKs[i] = i + 1;
        }
        return allPKs;
    }
    
    // 接收ETH
    receive() external payable {}
}