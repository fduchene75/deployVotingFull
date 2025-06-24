// Licence MIT pour le contrat
// SPDX-License-Identifier: MIT

// Définition de la version du compilateur Solidity à utiliser
pragma solidity 0.8.28;

// Import du contrat Ownable d'OpenZeppelin qui gère les permissions
import "@openzeppelin/contracts/access/Ownable.sol";
// Import de la librairie Strings d'OpenZeppelin pour manipuler les chaînes de caractères
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title Contrat de vote décentralisé
 * @author Votre nom
 * @notice Ce contrat permet de gérer un processus de vote avec enregistrement des votants et des propositions
 * @dev Hérite de Ownable pour gérer les permissions administrateur
 */
contract Voting is Ownable {
    // ::::::::::::: CUSTOM ERRORS ::::::::::::: //

    // Erreurs liées aux sessions de vote
    error SessionNotFinished();
    error SessionNotFound();

    // Erreurs liées aux votants
    error NotVoter();
    error AlreadyRegistered();
    error VotersRegistrationClosed();
    
    // Erreurs liées aux propositions
    error EmptyProposal();
    error ProposalsNotAllowed();
    error ProposalNotFound();
    
    // Erreurs liées au vote
    error AlreadyVoted();
    error VotingNotStarted();
    
    // Erreurs liées au workflow
    error RegistrationNotStarted();
    error ProposalsRegistrationNotEnded();
    error VotingSessionNotEnded();

    // Structure qui définit les propriétés d'un votant
    struct Voter {
        // Booléen indiquant si le votant est enregistré dans le système
        bool isRegistered;
        // Booléen indiquant si le votant a déjà voté
        bool hasVoted;
        // Identifiant de la proposition pour laquelle le votant a voté
        // Utilisation de uint32 pour optimiser le gas (packing)
        uint32 votedProposalId;
    }

    // Structure qui définit les propriétés d'une proposition
    struct Proposal {
        // Description textuelle de la proposition
        string description;
        // Compteur du nombre de votes reçus par la proposition
        uint voteCount;
    }

    // Il faut gérer plusieurs sessions de vote, donc on crée une structure pour les sessions
    struct VotingSession {
        string name;
        Proposal[] proposals;
        uint32 winningProposalID;
        WorkflowStatus workflowStatus;
    }

    // Énumération qui définit tous les états possibles du processus de vote
    enum  WorkflowStatus {
        // État initial : enregistrement des votants
        RegisteringVoters,
        // État : début de l'enregistrement des propositions
        ProposalsRegistrationStarted,
        // État : fin de l'enregistrement des propositions
        ProposalsRegistrationEnded,
        // État : début de la session de vote
        VotingSessionStarted,
        // État : fin de la session de vote
        VotingSessionEnded,
        // État final : votes comptabilisés
        VotesTallied
    }

    // On limite le nombre de propositions et la longueur des descriptions    
    uint32 public constant MAX_PROPOSALS = 1000;
    uint32 public constant MAX_DESCRIPTION_LENGTH = 1000;    

    uint32 public currentSessionId;
    uint32 public totalSessions;
    mapping(uint32 => VotingSession) public sessions;

    // Mapping qui associe chaque adresse à un votant (pour chaque session)
    mapping(uint32 => mapping(address => Voter)) public voters;

    // Événement émis quand une nouvelle session de vote est créée
    event SessionCreated(uint32 indexed sessionId, string sessionName);
    // Événement émis quand un nouveau votant est enregistré
    event VoterRegistered(uint32 indexed sessionId, address indexed voterAddress); 
    // Événement émis quand l'état du workflow change
    event WorkflowStatusChange(uint32 indexed sessionId, WorkflowStatus previousStatus, WorkflowStatus newStatus);
    // Événement émis quand une nouvelle proposition est enregistrée
    event ProposalRegistered(uint32 indexed sessionId, uint proposalId);
    // Événement émis quand un votant vote
    event Voted (uint32 indexed sessionId, address indexed voter, uint proposalId);

    // Constructeur du contrat qui initialise le propriétaire
    constructor() Ownable(msg.sender) {
        totalSessions = 1;
        sessions[0].name = "Session 1";
        sessions[0].workflowStatus = WorkflowStatus.RegisteringVoters;
        emit SessionCreated(0, "Session 1");
    }
    
    // Modificateur qui vérifie si l'appelant est un votant enregistré
    modifier onlyVoters() {
        // Vérifie si l'adresse de l'appelant est enregistrée comme votant
        if (!voters[currentSessionId][msg.sender].isRegistered) revert NotVoter();
        // Continue l'exécution de la fonction si la condition est remplie
        _;
    }
    
    // ::::::::::::: GETTERS ::::::::::::: //

    function workflowStatus() external view returns (WorkflowStatus) {
        return sessions[currentSessionId].workflowStatus;
    }

    function getCurrentSession() external view returns (
        uint32 sessionId,
        string memory name,
        WorkflowStatus status,
        uint32 proposalsCount,
        uint32 winningProposalId
    ) {
        VotingSession storage session = sessions[currentSessionId];
        return (
            currentSessionId,
            session.name,
            session.workflowStatus,
            uint32(session.proposals.length),
            session.winningProposalID
        );
    }

    function winningProposalID() external view returns (uint32) {
        return sessions[currentSessionId].winningProposalID;
    }

    /**
     * @notice Récupère les informations d'un votant
     * @param _addr L'adresse du votant à consulter
     * @return Voter Les informations complètes du votant
     */
    function getVoter(address _addr) external view returns (Voter memory) {
        // Retourne les informations du votant à l'adresse spécifiée
        return voters[currentSessionId][_addr];
    }
    
    /**
     * @notice Récupère les détails d'une proposition
     * @param _id L'identifiant de la proposition
     * @return Proposal Les informations de la proposition
     */
    function getOneProposal(uint _id) external view returns (Proposal memory) {
        // Retourne la proposition à l'index spécifié
        return sessions[currentSessionId].proposals[_id];
    }

    // ::::::::::::: REGISTRATION ::::::::::::: // 

    /**
     * @notice Enregistre un nouveau votant dans le système
     * @dev Fonction réservée au propriétaire, utilisable uniquement pendant la phase d'enregistrement
     * @param _addr L'adresse du votant à enregistrer
     */
    function addVoter(address _addr) external onlyOwner {
        if (sessions[currentSessionId].workflowStatus != WorkflowStatus.RegisteringVoters) revert VotersRegistrationClosed();
        if (voters[currentSessionId][_addr].isRegistered) revert AlreadyRegistered();
        voters[currentSessionId][_addr].isRegistered = true;
        emit VoterRegistered(currentSessionId, _addr);
    }

    // ::::::::::::: PROPOSAL ::::::::::::: // 

    /**
     * @notice Permet aux votants de soumettre une nouvelle proposition
     * @param _desc La description de la proposition (max 1000 caractères)
     */
    function addProposal(string calldata _desc) external onlyVoters {
        require(sessions[currentSessionId].proposals.length < MAX_PROPOSALS, "Too many proposals");
        require(bytes(_desc).length < MAX_DESCRIPTION_LENGTH, "Description too long");
        
        if (sessions[currentSessionId].workflowStatus != WorkflowStatus.ProposalsRegistrationStarted) revert ProposalsNotAllowed();
        if (bytes(_desc).length == 0) revert EmptyProposal();

        sessions[currentSessionId].proposals.push(Proposal(_desc, 0));

        unchecked {
            emit ProposalRegistered(currentSessionId, sessions[currentSessionId].proposals.length-1);
        }
    }

    // ::::::::::::: VOTE ::::::::::::: //

    /**
     * @notice Permet à un votant de voter pour une proposition
     * @param _id L'identifiant de la proposition choisie
     */
    function setVote(uint32 _id) external onlyVoters {

        // Vérifie si on est dans la phase de vote
        if (sessions[currentSessionId].workflowStatus != WorkflowStatus.VotingSessionStarted) revert VotingNotStarted();
        // Vérifie si le votant n'a pas déjà voté
        if (voters[currentSessionId][msg.sender].hasVoted) revert AlreadyVoted();
        // Vérifie si l'ID de la proposition est valide
        if (_id >= sessions[currentSessionId].proposals.length) revert ProposalNotFound();

        // Enregistre le vote du votant
        voters[currentSessionId][msg.sender].votedProposalId = _id;
        // Marque le votant comme ayant voté
        voters[currentSessionId][msg.sender].hasVoted = true;
        // Incrémente le compteur de votes de la proposition
         sessions[currentSessionId].proposals[_id].voteCount++;

        // Émet l'événement de vote
        emit Voted(currentSessionId, msg.sender, _id);
    }

    // ::::::::::::: STATE ::::::::::::: //

    function startNewVotingSession(string calldata _sessionName) external onlyOwner {
        // Vérifier que la session actuelle est terminée
        if (sessions[currentSessionId].workflowStatus != WorkflowStatus.VotesTallied) {
            revert SessionNotFinished();
        }
        
        // Créer nouvelle session
        currentSessionId = totalSessions;
        totalSessions++;

        // Nom de session par défaut si non fourni
        string memory sessionName = bytes(_sessionName).length == 0 
            ? string.concat("Session ", Strings.toString(totalSessions))
            : _sessionName;

        sessions[currentSessionId].name = sessionName;
        sessions[currentSessionId].workflowStatus = WorkflowStatus.RegisteringVoters;
        
        emit SessionCreated(currentSessionId, sessionName);
    }

    /**
     * @notice Démarre la phase d'enregistrement des propositions
     * @dev Ajoute automatiquement la proposition GENESIS
     */
    function startProposalsRegistering() external onlyOwner {
        if (sessions[currentSessionId].workflowStatus != WorkflowStatus.RegisteringVoters) revert RegistrationNotStarted();
        
        sessions[currentSessionId].workflowStatus = WorkflowStatus.ProposalsRegistrationStarted;
        sessions[currentSessionId].proposals.push(Proposal("GENESIS", 0));
        
        emit WorkflowStatusChange(currentSessionId, WorkflowStatus.RegisteringVoters, WorkflowStatus.ProposalsRegistrationStarted);
    }

    // Fonction pour terminer l'enregistrement des propositions
    function endProposalsRegistering() external onlyOwner {
        if (sessions[currentSessionId].workflowStatus != WorkflowStatus.ProposalsRegistrationStarted) revert RegistrationNotStarted();
        
        sessions[currentSessionId].workflowStatus = WorkflowStatus.ProposalsRegistrationEnded;
        emit WorkflowStatusChange(currentSessionId, WorkflowStatus.ProposalsRegistrationStarted, WorkflowStatus.ProposalsRegistrationEnded);
    }

    // Fonction pour démarrer la session de vote
    function startVotingSession() external onlyOwner {
        if (sessions[currentSessionId].workflowStatus != WorkflowStatus.ProposalsRegistrationEnded) revert ProposalsRegistrationNotEnded();
        
        sessions[currentSessionId].workflowStatus = WorkflowStatus.VotingSessionStarted;
        emit WorkflowStatusChange(currentSessionId, WorkflowStatus.ProposalsRegistrationEnded, WorkflowStatus.VotingSessionStarted);
    }

    // Fonction pour terminer la session de vote
    function endVotingSession() external onlyOwner {
        if (sessions[currentSessionId].workflowStatus != WorkflowStatus.VotingSessionStarted) revert VotingNotStarted();
        
        sessions[currentSessionId].workflowStatus = WorkflowStatus.VotingSessionEnded;
        emit WorkflowStatusChange(currentSessionId, WorkflowStatus.VotingSessionStarted, WorkflowStatus.VotingSessionEnded);
    }

    /**
     * @notice Comptabilise les votes et détermine la proposition gagnante
     * @dev Optimisé pour économiser le gas avec des variables temporaires
     */
    function tallyVotes() external onlyOwner {
        if (sessions[currentSessionId].workflowStatus != WorkflowStatus.VotingSessionEnded) revert VotingSessionNotEnded();
        
        uint32 _winningProposalId;
        uint maxVotes;
        uint32 proposalsCount = uint32(sessions[currentSessionId].proposals.length);
        
        for (uint32 p = 0; p < proposalsCount;) {
            uint currentVotes = sessions[currentSessionId].proposals[p].voteCount;
            if (currentVotes > maxVotes) {
                maxVotes = currentVotes;
                _winningProposalId = p;
            }
            unchecked { ++p; }
        }
        
        sessions[currentSessionId].winningProposalID = _winningProposalId;
        sessions[currentSessionId].workflowStatus = WorkflowStatus.VotesTallied;
        emit WorkflowStatusChange(currentSessionId, WorkflowStatus.VotingSessionEnded, WorkflowStatus.VotesTallied);
    }
}