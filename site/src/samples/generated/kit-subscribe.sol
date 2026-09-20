    /// @notice Mint the subscription amount to the caller, once, while subscriptions are open.
    function subscribe() external gated whenNotPaused {
        if (!subscriptionsOpen) revert SubscriptionsClosed();
        if (hasSubscribed[msg.sender]) revert AlreadySubscribed(msg.sender);
        hasSubscribed[msg.sender] = true;
        _mint(msg.sender, subscriptionAmount);
        emit Subscribed(msg.sender, subscriptionAmount);
    }
