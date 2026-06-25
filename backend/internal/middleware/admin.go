package middleware

import (
	"local-file-hub/backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// AdminRequired 管理员权限中间件
func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists {
			response.Error(c, response.CodeForbidden, "需要管理员权限")
			c.Abort()
			return
		}

		roleInt, ok := role.(int8)
		if !ok || roleInt != 1 {
			response.Error(c, response.CodeForbidden, "需要管理员权限")
			c.Abort()
			return
		}

		c.Next()
	}
}
