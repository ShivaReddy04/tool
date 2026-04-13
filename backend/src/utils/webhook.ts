import axios from 'axios';

export const sendSlackNotification = async (message: string, blocks?: any[]) => {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
        console.log('No Slack webhook URL configured, skipping notification.');
        return;
    }

    try {
        const payload: any = { text: message };
        if (blocks) {
            payload.blocks = blocks;
        }

        await axios.post(webhookUrl, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log('Slack notification sent successfully.');
    } catch (err) {
        console.error('Failed to send Slack notification:', err);
    }
};

export const sendTeamsNotification = async (title: string, message: string) => {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
    if (!webhookUrl) {
        console.log('No Teams webhook URL configured, skipping notification.');
        return;
    }

    try {
        const payload = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "themeColor": "0076D7",
            "summary": title,
            "sections": [{
                "activityTitle": title,
                "activitySubtitle": new Date().toISOString(),
                "text": message
            }]
        };

        await axios.post(webhookUrl, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log('Teams notification sent successfully.');
    } catch (err) {
        console.error('Failed to send Teams notification:', err);
    }
};

export const broadcastSubmissionEvent = async (event: 'SUBMITTED' | 'APPROVED' | 'REJECTED', details: {
    submittedBy: string,
    tableName: string,
    linkId: string,
    reason?: string,
}) => {
    const urls = process.env.DART_DASHBOARD_URL || 'http://localhost:3000';
    let text = '';
    let title = '';

    switch (event) {
        case 'SUBMITTED':
            title = 'New DART Table Submission for Review';
            text = `*${details.submittedBy}* has submitted table \`${details.tableName}\` for Architect review.\n\nReview it here: ${urls}/dashboard`;
            break;
        case 'APPROVED':
            title = 'DART Table Approved';
            text = `Architect *${details.submittedBy}* approved the table \`${details.tableName}\`.\n\nThe DDL has been scheduled for synchronization to the cluster.`;
            break;
        case 'REJECTED':
            title = 'DART Table Rejected';
            text = `Architect *${details.submittedBy}* has rejected the table \`${details.tableName}\`.\n\nReason: _${details.reason || 'No reason provided'}_`;
            break;
    }

    // Try firing to whatever is hooked up in .env
    await Promise.all([
        sendSlackNotification(text),
        sendTeamsNotification(title, text.replace(/\*/g, '**')) // Teams uses different markdown occasionally
    ]);
};
