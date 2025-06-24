const { expect } = require("chai");
const hre = require("hardhat");
const { PANIC_CODES } = require("@nomicfoundation/hardhat-chai-matchers/panic");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Voting contract", function () {
  const DEFAULT_PROPOSAL = "Proposal 1";
  const DEFAULT_PROPOSAL_ID = 1;
  const DEFAULT_SESSION_ID = 0;

  const WorkflowStatus = {
    RegisteringVoters: 0,
    ProposalsRegistrationStarted: 1,
    ProposalsRegistrationEnded: 2,
    VotingSessionStarted: 3,
    VotingSessionEnded: 4,
    VotesTallied: 5,
  };

  // *********** FIXTURES *********** //
  
  async function deployVotingFixture() {
    const [owner, voter1, voter2, voter3] = await ethers.getSigners();
    const voting = await ethers.deployContract("Voting");
    
    return { voting, owner, voter1, voter2, voter3 };
  }

  async function votingWithVotersFixture() {
    const { voting, owner, voter1, voter2, voter3 } = await loadFixture(deployVotingFixture);
    
    await voting.addVoter(voter1);
    await voting.addVoter(voter2);
    await voting.addVoter(voter3);
    
    return { voting, owner, voter1, voter2, voter3 };
  }

  async function proposalRegistrationStartedFixture() {
    const { voting, owner, voter1, voter2, voter3 } = await loadFixture(votingWithVotersFixture);
    
    await voting.startProposalsRegistering();
    
    return { voting, owner, voter1, voter2, voter3 };
  }

  async function proposalRegistrationEndedFixture() {
    const { voting, owner, voter1, voter2, voter3 } = await loadFixture(proposalRegistrationStartedFixture);
    
    await voting.connect(voter1).addProposal(DEFAULT_PROPOSAL);
    await voting.endProposalsRegistering();
    
    return { voting, owner, voter1, voter2, voter3 };
  }

  async function votingSessionStartedFixture() {
    const { voting, owner, voter1, voter2, voter3 } = await loadFixture(proposalRegistrationEndedFixture);
    
    await voting.startVotingSession();
    
    return { voting, owner, voter1, voter2, voter3 };
  }

  async function votingSessionEndedFixture() {
    const { voting, owner, voter1, voter2, voter3 } = await loadFixture(votingSessionStartedFixture);
    
    await voting.connect(voter1).setVote(DEFAULT_PROPOSAL_ID);
    await voting.endVotingSession();
    
    return { voting, owner, voter1, voter2, voter3 };
  }

  async function votesTalliedFixture() {
    const { voting, owner, voter1, voter2, voter3 } = await loadFixture(votingSessionEndedFixture);
    
    await voting.tallyVotes();
    
    return { voting, owner, voter1, voter2, voter3 };
  }

  async function multipleProposalsFixture() {
    const { voting, owner, voter1, voter2, voter3 } = await loadFixture(proposalRegistrationStartedFixture);
    
    await voting.connect(voter1).addProposal(DEFAULT_PROPOSAL);
    await voting.connect(voter2).addProposal("Proposal 2");
    await voting.connect(voter3).addProposal("Proposal 3");
    await voting.endProposalsRegistering();
    
    return { voting, owner, voter1, voter2, voter3 };
  }

  // *********** Get one proposal *********** //
  describe("getOneProposal(uint proposalId)", function () {
    it("Should get an existing proposal", async function () {
      const { voting, voter1 } = await loadFixture(proposalRegistrationEndedFixture);
      
      expect((await voting.connect(voter1).getOneProposal(DEFAULT_PROPOSAL_ID)).description).to.equal(DEFAULT_PROPOSAL);
    });

    it("Should fail trying to get a non existing proposal", async function () {
      const { voting, voter1 } = await loadFixture(proposalRegistrationEndedFixture);
      
      await expect(voting.connect(voter1).getOneProposal(424242)).to.be.revertedWithPanic(PANIC_CODES.ARRAY_ACCESS_OUT_OF_BOUNDS);
    });

  });

  // *********** Get one voter *********** //
  describe("getVoter(address voterAddress)", function () {
    it("Should get existing voters", async function () {
      const { voting, voter1, voter2, voter3 } = await loadFixture(votingWithVotersFixture);

      expect((await voting.connect(voter1).getVoter(voter1)).isRegistered).to.equal(true);
      expect((await voting.connect(voter1).getVoter(voter2)).isRegistered).to.equal(true);
      expect((await voting.connect(voter1).getVoter(voter3)).isRegistered).to.equal(true);
    });

    it("Should not fail trying to get a voter without being a voter", async function () {
      const { voting, voter1 } = await loadFixture(deployVotingFixture);
      
      await expect(voting.getVoter(voter1)).to.not.be.reverted;
    });
  });

  // *********** Add voter *********** //
  describe("addVoter(address voterAddress)", function () {
    it("Should add a voter", async function () {
      const { voting, owner } = await loadFixture(deployVotingFixture);
      
      await voting.addVoter(owner);
      expect((await voting.connect(owner).getVoter(owner)).isRegistered).to.equal(true);
    });

    it("Should fail trying to add an already registered voter", async function () {
      const { voting, voter1 } = await loadFixture(votingWithVotersFixture);

      await expect(voting.addVoter(voter1)).to.be.revertedWithCustomError(voting, "AlreadyRegistered");
    });

    it("Should fail trying to add a voter in the wrong workflow status", async function () {
      const { voting, voter2 } = await loadFixture(proposalRegistrationStartedFixture);

      await expect(voting.addVoter(voter2)).to.be.revertedWithCustomError(voting, "VotersRegistrationClosed");
    });

    it("Should fail trying to add a voter without being the owner", async function () {
      const { voting, voter1, voter2 } = await loadFixture(deployVotingFixture);
      
      await expect(voting.connect(voter1).addVoter(voter2))
        .to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount")
        .withArgs(voter1);
    });

    it("Should emit an event when adding a voter", async function () {
      const { voting, voter1 } = await loadFixture(deployVotingFixture);
      
      await expect(voting.addVoter(voter1)).to.emit(voting, "VoterRegistered").withArgs(DEFAULT_SESSION_ID, voter1);
    });
  });

  // *********** Add proposal *********** //
  describe("addProposal(string proposalDescription)", function () {
    it("Should add a proposal", async function () {
      const { voting, voter1 } = await loadFixture(proposalRegistrationStartedFixture);
      
      await voting.connect(voter1).addProposal("New proposal");
      expect((await voting.connect(voter1).getOneProposal(1)).description).to.equal("New proposal");
    });

    it("Should fail trying to add an empty proposal", async function () {
      const { voting, voter1 } = await loadFixture(proposalRegistrationStartedFixture);
      
      await expect(voting.connect(voter1).addProposal("")).to.be.revertedWithCustomError(voting, "EmptyProposal");
    });

    it("Should fail trying to add a proposal in the wrong workflow status", async function () {
      const { voting, voter1 } = await loadFixture(proposalRegistrationEndedFixture);
      
      await expect(voting.connect(voter1).addProposal("New proposal")).to.be.revertedWithCustomError(voting, "ProposalsNotAllowed");
    });

    it("Should fail trying to add a proposal without being voter", async function () {
      const { voting } = await loadFixture(proposalRegistrationStartedFixture);
      
      await expect(voting.addProposal("New proposal")).to.be.revertedWithCustomError(voting, "NotVoter");
    });

    it("Should emit an event when adding a proposal", async function () {
      const { voting, voter1 } = await loadFixture(proposalRegistrationStartedFixture);
      
      await expect(voting.connect(voter1).addProposal("New proposal")).to.emit(voting, "ProposalRegistered").withArgs(DEFAULT_SESSION_ID, 1);
    });
  });

  // *********** Add vote *********** //
  describe("setVote(uint proposalId)", function () {
    it("Should add a vote", async function () {
      const { voting, voter1 } = await loadFixture(votingSessionStartedFixture);
      
      await voting.connect(voter1).setVote(DEFAULT_PROPOSAL_ID);

      expect((await voting.connect(voter1).getVoter(voter1)).hasVoted).to.equal(true);
      expect((await voting.connect(voter1).getVoter(voter1)).votedProposalId).to.equal(DEFAULT_PROPOSAL_ID);
    });

    it("Should fail trying to vote for a non existing proposal", async function () {
      const { voting, voter1 } = await loadFixture(votingSessionStartedFixture);
      
      await expect(voting.connect(voter1).setVote(42424242)).to.be.revertedWithCustomError(voting, "ProposalNotFound");
    });

    it("Should fail trying to vote in a wrong workflow status", async function () {
      const { voting, voter1 } = await loadFixture(votingSessionEndedFixture);
      
      await expect(voting.connect(voter1).setVote(DEFAULT_PROPOSAL_ID)).to.be.revertedWithCustomError(voting, "VotingNotStarted");
    });

    it("Should fail trying to vote twice", async function () {
      const { voting, voter1 } = await loadFixture(votingSessionStartedFixture);
      
      await voting.connect(voter1).setVote(DEFAULT_PROPOSAL_ID);
      await expect(voting.connect(voter1).setVote(DEFAULT_PROPOSAL_ID)).to.be.revertedWithCustomError(voting, "AlreadyVoted");
    });

    it("Should fail trying to vote without being a voter", async function () {
      const { voting } = await loadFixture(votingSessionStartedFixture);
      
      await expect(voting.setVote(DEFAULT_PROPOSAL_ID)).to.be.revertedWithCustomError(voting, "NotVoter");
    });

    it("Should emit an event when voting", async function () {
      const { voting, voter1 } = await loadFixture(votingSessionStartedFixture);
      
      await expect(voting.connect(voter1).setVote(DEFAULT_PROPOSAL_ID)).to.emit(voting, "Voted").withArgs(DEFAULT_SESSION_ID, voter1, DEFAULT_PROPOSAL_ID);
    });
  });

  // *********** Change workflow status *********** //
  // *********** Start proposal time *********** //
  describe("startProposalRegistering()", function () {
    it("Should start proposal time", async function () {
      const { voting } = await loadFixture(votingWithVotersFixture);
      
      await voting.startProposalsRegistering();
      expect(await voting.workflowStatus()).to.equal(WorkflowStatus.ProposalsRegistrationStarted);
    });

    it("Should fail trying to start proposal time in wrong workflow status", async function () {
      const { voting } = await loadFixture(proposalRegistrationEndedFixture);

      await expect(voting.startProposalsRegistering()).to.be.revertedWithCustomError(voting, "RegistrationNotStarted");
    });

    it("Should fail trying to start proposal time without being owner", async function () {
      const { voting, voter1 } = await loadFixture(votingWithVotersFixture);
      
      await expect(voting.connect(voter1).startProposalsRegistering())
        .to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount")
        .withArgs(voter1);
    });

    it("Should emit an event when starting proposal time", async function () {
      const { voting } = await loadFixture(votingWithVotersFixture);
      
      await expect(voting.startProposalsRegistering())
        .to.emit(voting, "WorkflowStatusChange")
        .withArgs(DEFAULT_SESSION_ID, WorkflowStatus.RegisteringVoters, WorkflowStatus.ProposalsRegistrationStarted);
    });
  });

  // *********** End proposal time *********** //
  describe("endProposalRegistering()", function () {
    it("Should end proposal time", async function () {
      const { voting, voter1 } = await loadFixture(proposalRegistrationStartedFixture);
      
      await voting.connect(voter1).addProposal("Test proposal");
      await voting.endProposalsRegistering();
      expect(await voting.workflowStatus()).to.equal(WorkflowStatus.ProposalsRegistrationEnded);
    });

    it("Should fail trying to end proposal time in wrong workflow status", async function () {
      const { voting } = await loadFixture(proposalRegistrationEndedFixture);
      
      await expect(voting.endProposalsRegistering()).to.be.revertedWithCustomError(voting, "RegistrationNotStarted");
    });

    it("Should fail trying to end proposal time without being owner", async function () {
      const { voting, voter1 } = await loadFixture(proposalRegistrationStartedFixture);
      
      await expect(voting.connect(voter1).endProposalsRegistering())
        .to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount")
        .withArgs(voter1);
    });

    it("Should emit an event when ending proposal time", async function () {
      const { voting, voter1 } = await loadFixture(proposalRegistrationStartedFixture);
      
      await voting.connect(voter1).addProposal("Test proposal");
      await expect(voting.endProposalsRegistering())
        .to.emit(voting, "WorkflowStatusChange")
        .withArgs(DEFAULT_SESSION_ID, WorkflowStatus.ProposalsRegistrationStarted, WorkflowStatus.ProposalsRegistrationEnded);
    });
  });

  // *********** Start voting session *********** //
  describe("startVotingSession()", function () {
    it("Should start voting session", async function () {
      const { voting } = await loadFixture(proposalRegistrationEndedFixture);
      
      await voting.startVotingSession();
      expect(await voting.workflowStatus()).to.equal(WorkflowStatus.VotingSessionStarted);
    });

    it("Should fail trying to start voting session in wrong workflow status", async function () {
      const { voting } = await loadFixture(votingSessionStartedFixture);
      
      await expect(voting.startVotingSession()).to.be.revertedWithCustomError(voting, "ProposalsRegistrationNotEnded");
    });

    it("Should fail trying to start voting session without being owner", async function () {
      const { voting, voter1 } = await loadFixture(proposalRegistrationEndedFixture);
      
      await expect(voting.connect(voter1).startVotingSession())
        .to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount")
        .withArgs(voter1);
    });

    it("Should emit an event when starting voting session", async function () {
      const { voting } = await loadFixture(proposalRegistrationEndedFixture);
      
      await expect(voting.startVotingSession())
        .to.emit(voting, "WorkflowStatusChange")
        .withArgs(DEFAULT_SESSION_ID, WorkflowStatus.ProposalsRegistrationEnded, WorkflowStatus.VotingSessionStarted);
    });
  });

  // *********** End voting session *********** //
  describe("endVotingSession()", function () {
    it("Should end voting session", async function () {
      const { voting } = await loadFixture(votingSessionStartedFixture);
      
      await voting.endVotingSession();
      expect(await voting.workflowStatus()).to.equal(WorkflowStatus.VotingSessionEnded);
    });

    it("Should fail trying to end voting session in wrong workflow status", async function () {
      const { voting } = await loadFixture(votingSessionEndedFixture);
      
      await expect(voting.endVotingSession()).to.be.revertedWithCustomError(voting, "VotingNotStarted");
    });

    it("Should fail trying to end voting session without being owner", async function () {
      const { voting, voter1 } = await loadFixture(votingSessionStartedFixture);
      
      await expect(voting.connect(voter1).endVotingSession())
        .to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount")
        .withArgs(voter1);
    });

    it("Should emit an event when ending voting session", async function () {
      const { voting } = await loadFixture(votingSessionStartedFixture);
      
      await expect(voting.endVotingSession())
        .to.emit(voting, "WorkflowStatusChange")
        .withArgs(DEFAULT_SESSION_ID, WorkflowStatus.VotingSessionStarted, WorkflowStatus.VotingSessionEnded);
    });
  });

  // *********** Tally *********** //
  describe("tallyVotes()", function () {
    it("Should tally voters (with only 1 proposal)", async function () {
      const { voting } = await loadFixture(votesTalliedFixture);

      expect(await voting.winningProposalID()).to.equal(DEFAULT_PROPOSAL_ID);
    });

    it("Should tally vote (with multiple proposals)", async function () {
      const { voting, voter1, voter2, voter3 } = await loadFixture(multipleProposalsFixture);
      
      await voting.startVotingSession();
      await voting.connect(voter1).setVote(1); // Proposal 1
      await voting.connect(voter2).setVote(2); // Proposal 2
      await voting.connect(voter3).setVote(1); // Proposal 1
      await voting.endVotingSession();
      await voting.tallyVotes();

      expect(await voting.winningProposalID()).to.equal(1);
    });

    it("Should tally vote (with tie vote)", async function () {
      const { voting, voter1, voter2 } = await loadFixture(multipleProposalsFixture);
      
      await voting.startVotingSession();
      await voting.connect(voter1).setVote(1); // Proposal 1
      await voting.connect(voter2).setVote(2); // Proposal 2
      await voting.endVotingSession();
      await voting.tallyVotes();

      expect(await voting.winningProposalID()).to.equal(1); // First proposal wins in case of tie
    });

    it("Should tally votes (without any votes)", async function () {
      const { voting } = await loadFixture(proposalRegistrationEndedFixture);
      
      await voting.startVotingSession();
      await voting.endVotingSession();
      await voting.tallyVotes();

      expect(await voting.winningProposalID()).to.equal(0);
    });

    it("Should fail trying to tally votes without being owner", async function () {
      const { voting, voter1 } = await loadFixture(votingSessionEndedFixture);
      
      await expect(voting.connect(voter1).tallyVotes())
        .to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount")
        .withArgs(voter1);
    });

    it("Should fail trying to tally votes in wrong workflow status", async function () {
      const { voting } = await loadFixture(deployVotingFixture);
      
      await expect(voting.tallyVotes()).to.be.revertedWithCustomError(voting, "VotingSessionNotEnded");
    });

    it("Should emit an event when tallying votes", async function () {
      const { voting } = await loadFixture(votingSessionEndedFixture);

      await expect(voting.tallyVotes())
        .to.emit(voting, "WorkflowStatusChange")
        .withArgs(DEFAULT_SESSION_ID, WorkflowStatus.VotingSessionEnded, WorkflowStatus.VotesTallied);
    });
  });

// *********** LOAD TESTING *********** //
  describe("Load Testing - DOS Prevention", function () {
    // Augmenter le timeout pour les tests de charge
    this.timeout(300000); // 5 minutes

    const LARGE_DESCRIPTION = "ABC".repeat(332); // 996 caractères
    const MAX_PROPOSALS_TEST = 999;

    async function loadTestFixture() {
      const { voting, owner, voter1, voter2, voter3 } = await loadFixture(deployVotingFixture);
      
      // Ajouter plusieurs votants pour répartir la charge
      const voters = [voter1, voter2, voter3];
      for (let i = 0; i < voters.length; i++) {
        await voting.addVoter(voters[i]);
      }
      
      await voting.startProposalsRegistering();
      
      return { voting, owner, voters };
    }

    it("Should fail trying to add a very large description", async function () {
      const { voting, voter1 } = await loadFixture(proposalRegistrationStartedFixture);
      await expect(voting.connect(voter1).addProposal(LARGE_DESCRIPTION+"ZZZZ")).to.be.reverted;
    });

    describe("Large number of proposals", function () {
      it("Should handle adding MAX proposals with large descriptions", async function () {
        const { voting, voters } = await loadFixture(loadTestFixture);
        
        console.log("Starting to add MAX proposals...");
        const startTime = Date.now();
        
        // Ajouter MAX propositions avec descriptions de 999 caractères
        for (let i = 0; i < MAX_PROPOSALS_TEST; i++) {
          const voterIndex = i % voters.length;
          const description = `${LARGE_DESCRIPTION}${i}`;
          
          await voting.connect(voters[voterIndex]).addProposal(description);
          
          // Log du progrès tous les 100 propositions
          if ((i + 1) % 100 === 0) {
            console.log(`  Added ${i + 1}/${MAX_PROPOSALS_TEST} proposals`);
          }
        }
        
        const endTime = Date.now();
        console.log(`Completed adding ${MAX_PROPOSALS_TEST} proposals in ${endTime - startTime}ms`);
        
        // Vérifier qu'on a bien 999 propositions (GENESIS + 998)
        const proposal = await voting.connect(voters[0]).getOneProposal(MAX_PROPOSALS_TEST);
        expect(proposal.description).to.include(`${LARGE_DESCRIPTION}${MAX_PROPOSALS_TEST - 1}`);
      });

      it("Should fail trying to add too many proposals", async function () {
        const { voting, voter1 } = await loadFixture(proposalRegistrationStartedFixture);
        // Ajouter MAX propositions
        for (let i = 0; i < MAX_PROPOSALS_TEST; i++) {
          const description = `desc${i}`;
          await voting.connect(voter1).addProposal(description);
        }        
        await expect(voting.connect(voter1).addProposal("extra proposal")).to.be.reverted;
      });

    });

  });

  // *********** SESSION MANAGEMENT *********** //
  describe("Session Management", function () {
    
    it("Should initialize with first session", async function () {
      const { voting } = await loadFixture(deployVotingFixture);
      
      expect(await voting.currentSessionId()).to.equal(0);
      expect(await voting.totalSessions()).to.equal(1);
      expect(await voting.workflowStatus()).to.equal(WorkflowStatus.RegisteringVoters);
    });

    it("Should start a new session after completing first one", async function () {
      const { voting } = await loadFixture(votesTalliedFixture);
      
      await voting.startNewVotingSession("Session 2");
      
      expect(await voting.currentSessionId()).to.equal(1);
      expect(await voting.totalSessions()).to.equal(2);
      expect(await voting.workflowStatus()).to.equal(WorkflowStatus.RegisteringVoters);
    });

    it("Should use default name when session name is empty", async function () {
      const { voting } = await loadFixture(votesTalliedFixture);
      
      await voting.startNewVotingSession("");
      
      const session = await voting.getCurrentSession();
      expect(session.name).to.equal("Session 2");
    });

    it("Should fail to start new session if current not finished", async function () {
      const { voting } = await loadFixture(votingWithVotersFixture);
      
      await expect(voting.startNewVotingSession("New Session"))
        .to.be.revertedWithCustomError(voting, "SessionNotFinished");
    });

    it("Should isolate voters between sessions", async function () {
      const { voting, voter1 } = await loadFixture(votesTalliedFixture);
      
      // Start new session
      await voting.startNewVotingSession("Session 2");
      
      // voter1 was registered in session 1 but not in session 2
      expect((await voting.connect(voter1).getVoter(voter1)).isRegistered).to.equal(false);
    });

    it("Should emit SessionCreated event", async function () {
      const { voting } = await loadFixture(votesTalliedFixture);
      
      await expect(voting.startNewVotingSession("Test Session"))
        .to.emit(voting, "SessionCreated")
        .withArgs(1, "Test Session");
    });
  });

});