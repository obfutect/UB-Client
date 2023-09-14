/*
    This trivial UB Client is distributed under the terms of MIT license.
 */


/**
 * Blockchain address of the main UncensoredBulletin smart contract on Polygon chain.
 * @type {string}
 */
const UB_CONTRACT_ADDRESS = "0x19250120917529c25EeEb3FAEdE3977e313b4e49"; // Polygon

/**
 * JsonRPC endpoint.
 * @type {string}
 */
const JSONRPC = "https://polygon.llamarpc.com"; // Polygon

/**
 * Blockchain address of the Editor's Token Contract smart contract on Polygon chain.
 * @type {string}
 */
let ETC_CONTRACT_ADDRESS = "";

/**
 * UncensoredBulletin smart contract user ABI.
 * @type {string[]}
 */
const UB_ABI = [
    "function getDocumentationURL() external view returns(string memory)",
    "function getETC() external view returns(address)",
    "function totalPosts() external view returns (uint256)",
    "function getUserStatus() external view returns (string memory)",
    "function postAt(uint256)external view returns(tuple(uint256, string, string, string, address, uint256, string) memory)",
    "function submitFeedback(string memory _fb) public",
    "function getCreatorUIPackageURL() external view returns(string memory)"
];

/**
 * Editor's Token Contract smart contract user ABI.
 * @type {string[]}
 */
const ETC_ABI = [
    "function getManagerAlias() external view returns (string memory)",
    "function getAuthorAlias(address) external view returns (string memory)",
    "function subscriptionPrice() public view returns (uint256)",
    "function verifySubscription(address subscriber) public view returns (uint256)",
    "function subscribe(uint256 periodCount) external payable"
];

/**
 * The post was deleted by the author
 * @type {number}
 */
const POST_TYPE_DELETED = 0;

/**
 * The post is public.
 * @type {number}
 */
const POST_TYPE_PUBLIC = 1;

/**
 * The post is available to subscribers only.
 * @type {number}
 */
const POST_TYPE_SUBSCRIPTION = 1 << 1;
const POST_TYPE_IPFS = 1 << 2;

/**
 * UncensoredBulletin interface implementation
 */
export class UncensoredBulletin
{
    /**
     * Creates a new instance of UncensoredBulletin
     * @param ethers - ethers from the EthersJS module
     */
    constructor(ethers)
    {
        this.ethers = ethers;
        this.provider = new ethers.JsonRpcProvider(JSONRPC);
        this.ubContract = new ethers.Contract(UB_CONTRACT_ADDRESS, UB_ABI, this.provider);
        this.account = null;
        this.connected = false;

        this.ubContract.getETC()
            .then(async (address) =>
            {
                ETC_CONTRACT_ADDRESS = address;
                this.etcContract = new ethers.Contract(ETC_CONTRACT_ADDRESS, ETC_ABI, this.provider);
                console.log(`ETC contract's address is ${ETC_CONTRACT_ADDRESS}`);
                this.connected = true;
            })
            .catch((error) =>
            {
                console.log(`Could not retrieve the ETC contract address: ${error.message}`);
            })
    }

    /**
     * Retrieves the Alias/Name of the UB manager (if specified).
     * @returns {Promise<string>}
     */
    async getManagerAlias()
    {
        return await this.etcContract.getManagerAlias();
    }

    /**
     * Retrieves the Alias/Name of an author (if specified)
     * @param authorAddress - Author's blockchain address
     * @returns {Promise<string>}
     */
    async getAuthorAlias(authorAddress)
    {
        return await this.etcContract.getAuthorAlias(authorAddress);
    }

    /**
     * Verifies whether a user has valid subscription
     * @param subscriberAddress - Blockchain address of the user
     * @returns {Promise<boolean>}
     */
    async verifySubscription(subscriberAddress)
    {
        return (await this.etcContract.verifySubscription(subscriberAddress) === 1);
    }

    /**
     * Stores user feedback on blockchain.
     * This function requires a valid blockchain account for the caller
     * @param message - Text to store on blockchain
     * @returns {Promise<void>}
     */
    async submitFeedback(message)
    {
        if (!this.account)
            throw new Error('Active account is needed.');
        const _ubc = this.ubContract.connect(this.account.connect(this.provider));
        await _ubc.submitFeedback(message);
    }

    /**
     * Retrieves the URL of the latest published build of the UncensoredBulletin Viewer.
     * @returns {Promise<string>}
     */
    async getUIPackageURL()
    {
        return await this.ubContract.getCreatorUIPackageURL();
    }

    /**
     * Retrieves textual representation of the user's status
     * Possible values are:
     *  "manager" - if the caller owns the manager token,
     *  "author" - if the caller has been granted an author token (can publish content),
     *  "subscriber" - if the caller has a valid subscription,
     *  "viewer" - the rest of the cases.
     *
     * The first three options are only returned if a valid blockchain account has been set.
     *
     * @returns {Promise<string>}
     */
    async getUserStatus()
    {
        const _ubc = (this.account) ? this.ubContract.connect(this.account.connect(this.provider)) : this.ubContract;
        return await _ubc.getUserStatus();
    }

    /**
     * Retrieves the total amount of posts published on the platform
     * (this includes posts removed by their authors).
     * @returns {Promise<Number>}
     */
    async totalPosts()
    {
        return await this.ubContract.totalPosts();
    }

    /**
     * Purchases subscription on caller's behalf.
     * @param periodCount
     * @returns {Promise<void>}
     */
    async subscribe(periodCount)
    {
        if (!this.account)
            throw new Error('Active account is needed.');

        const _etc = this.etcContract.connect(this.account.connect(this.provider));
        _etc.subscribe(periodCount);
    }

    async getPostAtIndex(idx)
    {
        const numPosts = await this.totalPosts();

        if (idx >= numPosts)
            throw new Error("Index too high");

        const _ubc = (this.account) ? this.ubContract.connect(this.account.connect(this.provider)) : this.ubContract;
        const _etc = (this.account) ? this.etcContract.connect(this.account.connect(this.provider)) : this.etcContract;

        try
        {
            const p = await _ubc.postAt(idx);
            let alias = await _etc.getAuthorAlias(p[4]);

            return {
                postType: Number(p[0]),
                postTitle: p[1],
                postSummary: p[2],
                postContent: p[3],
                postAuthor: (alias === "") ? p[4] : alias,
                postTime: Number(p[5])
            };
        }
        catch (exception)
        {
            if (exception.reason === 'You need a valid subscription to view this post')
            {
                return null;
            }
            throw exception;
        }
    }


    createAccount()
    {
        this.account = this.ethers.Wallet.createRandom(this.provider);
    }

    async saveAccount(password)
    {
        return this.account.encrypt(password);
    }

    async loadAccount(encryptedJsonString, password)
    {
        this.account = await this.ethers.fromEncryptedJson(encryptedJsonString, password);
    }

    importAccount(privateKey)
    {
        this.account = new this.ethers.Wallet(privateKey);
    }

    async subscriptionPrice()
    {
        return await this.etcContract.subscriptionPrice();
    }

    postType2String(postType)
    {
        let typeString = "";
        if (postType === 0)
            typeString = "Removed ";
        else
        {
            if ((postType & POST_TYPE_PUBLIC) !== 0)
                typeString += "Public ";
            if ((postType & POST_TYPE_SUBSCRIPTION) !== 0)
                typeString += " | Subscription only ";
            if ((postType & POST_TYPE_IPFS) !== 0)
                typeString += " | IPFS CID";
            else
                typeString += " | Text content";
        }
        return typeString;
    }
}

