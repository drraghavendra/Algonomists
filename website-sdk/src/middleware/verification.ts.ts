import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to add verification header for website ownership
 */
export function verificationHeader(headerValue: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.set('X-AgentWeb-Verification', headerValue);
    next();
  };
}

/**
 * Middleware to validate agent requests
 */
export function validateAgentRequest(req: Request, res: Response, next: NextFunction) {
  const requiredHeaders = [
    'x-agentweb-signature',
    'x-agentweb-session-id',
    'x-query-type'
  ];

  const missingHeaders = requiredHeaders.filter(header => !req.headers[header]);

  if (missingHeaders.length > 0) {
    return res.status(400).json({
      error: 'Missing required agent headers',
      missing: missingHeaders
    });
  }

  next();
}